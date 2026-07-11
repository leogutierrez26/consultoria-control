import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireAdmin, currentClientId, isAdmin, ApiError } from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';

const router = Router();

function clientScope(req: any): string | null {
  return isAdmin(req) ? null : currentClientId(req);
}

// Verifica que el proyecto pertenezca al cliente del usuario (RN-004) y sea visible
async function assertProjectAccess(req: any, projectId: string): Promise<void> {
  const scope = clientScope(req);
  if (!scope) return;
  const r = await query('SELECT client_id, visible_to_client FROM projects WHERE id = $1', [projectId]);
  const p = r.rows[0];
  if (!p || p.client_id !== scope || !p.visible_to_client) {
    throw new ApiError(403, 'No autorizado para este proyecto');
  }
}

// RF-ACT-001 Crear actividad
router.post(
  '/',
  requireAdmin,
  validate([
    body('project_id').isUUID(),
    body('title').isString().notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const id = uuid();
    const {
      project_id, parent_activity_id, title, description, responsible,
      status = 'pendiente', priority = 'media', start_date, due_date,
      estimated_hours, progress = 0, billable = true, visible_to_client = true
    } = req.body;
    // RN-003 subtarea mismo proyecto
    if (parent_activity_id) {
      const par = await query('SELECT project_id FROM activities WHERE id = $1', [parent_activity_id]);
      if (!par.rows[0] || par.rows[0].project_id !== project_id) {
        return res.status(400).json({ error: 'La actividad principal no pertenece a este proyecto' });
      }
    }
    await query(
      `INSERT INTO activities (id, project_id, parent_activity_id, title, description, responsible, status, priority, start_date, due_date, estimated_hours, progress, billable, visible_to_client, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
      [id, project_id, parent_activity_id || null, title, description, responsible, status, priority, start_date, due_date, estimated_hours, progress, billable, visible_to_client]
    );
    audit({ user_id: (req as any).user.uid, action: 'create', entity: 'activities', entity_id: id, new_values: req.body });
    res.status(201).json({ activity: { id, ...req.body } });
  })
);

// RF-ACT-008 Filtros de actividades
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = clientScope(req);
    const filters: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const { project_id, status, priority, responsible, due, visible } = req.query as any;
    if (project_id) { filters.push(`a.project_id = $${i++}`); vals.push(project_id); }
    if (status) { filters.push(`a.status = $${i++}`); vals.push(status); }
    if (priority) { filters.push(`a.priority = $${i++}`); vals.push(priority); }
    if (responsible) { filters.push(`a.responsible = $${i++}`); vals.push(responsible); }
    if (due === 'overdue') { filters.push(`a.due_date < CURRENT_DATE AND a.status <> 'finalizada'`); }
    if (scope) { filters.push(`a.visible_to_client = true AND p.client_id = $${i++}`); vals.push(scope); }

    let sql = `SELECT a.*, p.client_id FROM activities a JOIN projects p ON p.id = a.project_id`;
    if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
    sql += ' ORDER BY a.due_date NULLS LAST, a.created_at DESC';
    const r = await query(sql, vals);
    res.json({ activities: r.rows });
  })
);

// RF-ACT-002 / 009 vista
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query('SELECT a.*, p.client_id, p.visible_to_client FROM activities a JOIN projects p ON p.id = a.project_id WHERE a.id = $1', [req.params.id]);
    const a = r.rows[0];
    if (!a) return res.status(404).json({ error: 'No encontrada' });
    const scope = clientScope(req);
    if (scope && (scope !== a.client_id || !a.visible_to_client)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const subs = await query('SELECT * FROM activities WHERE parent_activity_id = $1', [a.id]);
    const updates = await query('SELECT * FROM updates WHERE activity_id = $1 ORDER BY created_at', [a.id]);
    res.json({ activity: a, subtasks: subs.rows, updates: updates.rows });
  })
);

// RF-ACT-004 Editar actividad (cambios de estado/fecha registran en seguimiento - RF-ACT-004)
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const allowed = ['title','description','responsible','status','priority','start_date','due_date','estimated_hours','progress','billable','visible_to_client'];
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const oldR = await query('SELECT * FROM activities WHERE id = $1', [req.params.id]);
    const old = oldR.rows[0];
    for (const f of allowed) {
      if (req.body[f] !== undefined) { sets.push(`${f} = $${i++}`); vals.push(req.body[f]); }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push('updated_at = NOW()');
    vals.push(req.params.id);
    await query(`UPDATE activities SET ${sets.join(', ')} WHERE id = $${i}`, vals);

    // RF-SEG: registrar cambio de estado/fecha en línea de seguimiento
    if (req.body.status && req.body.status !== old.status) {
      await query(
        `INSERT INTO updates (id, activity_id, author_id, type, content, visibility, created_at)
         VALUES ($1,$2,$3,'cambio_estado',$4,'privada',NOW())`,
        [uuid(), req.params.id, (req as any).user.uid, `Estado: ${old.status} -> ${req.body.status}`]
      );
    }
    audit({ user_id: (req as any).user.uid, action: 'update', entity: 'activities', entity_id: req.params.id, old_values: old, new_values: req.body });
    res.json({ ok: true });
  })
);

// RF-ACT-005 Finalizar / RF-ACT-006 Reabrir
router.post(
  '/:id/:action(finalize|reopen)',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (req.params.action === 'finalize') {
      const subs = await query("SELECT id FROM activities WHERE parent_activity_id = $1 AND status <> 'finalizada'", [req.params.id]);
      if (subs.rows.length) return res.status(400).json({ error: 'Tiene subtareas pendientes' });
      await query("UPDATE activities SET status = 'finalizada', progress = 100, updated_at = NOW() WHERE id = $1", [req.params.id]);
    } else {
      await query("UPDATE activities SET status = 'en_ejecucion', updated_at = NOW() WHERE id = $1", [req.params.id]);
    }
    audit({ user_id: (req as any).user.uid, action: 'status_change', entity: 'activities', entity_id: req.params.id, new_values: { action: req.params.action } });
    res.json({ ok: true });
  })
);

export default router;
