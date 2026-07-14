import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireAdmin, currentClientId, isAdmin, ApiError } from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query, transaction } from '../db';
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
    body('project_id').optional({ nullable: true, checkFalsy: true }).isUUID(),
    body('client_id').optional({ nullable: true, checkFalsy: true }).isUUID(),
    body('title').isString().notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const id = uuid();
    const {
      project_id = null, client_id = null, parent_activity_id, title, description, responsible,
      status = 'pendiente', priority = 'media', start_date, due_date,
      estimated_hours, progress = 0, billable = true, visible_to_client = true
    } = req.body;
    let finalClientId = client_id || null;
    if (project_id) {
      const p = await query('SELECT client_id FROM projects WHERE id = $1', [project_id]);
      if (!p.rows[0]) return res.status(400).json({ error: 'Proyecto no encontrado' });
      if (finalClientId && finalClientId !== p.rows[0].client_id) {
        return res.status(400).json({ error: 'El cliente no coincide con el proyecto seleccionado' });
      }
      finalClientId = p.rows[0].client_id;
    }
    // RN-003 subtarea mismo proyecto
    if (parent_activity_id) {
      const par = await query('SELECT project_id, client_id FROM activities WHERE id = $1', [parent_activity_id]);
      if (
        !par.rows[0] ||
        (par.rows[0].project_id || null) !== (project_id || null) ||
        (par.rows[0].client_id || null) !== (finalClientId || null)
      ) {
        return res.status(400).json({ error: 'La actividad principal no pertenece al mismo proyecto/cliente' });
      }
    }
    await query(
      `INSERT INTO activities (id, project_id, client_id, parent_activity_id, title, description, responsible, status, priority, start_date, due_date, estimated_hours, progress, billable, visible_to_client, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())`,
      [id, project_id || null, finalClientId, parent_activity_id || null, title, description, responsible, status, priority, start_date, due_date, estimated_hours, progress, billable, visible_to_client]
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
    const { client_id, project_id, status, priority, responsible, due, visible } = req.query as any;
    if (client_id && !scope) { filters.push(`COALESCE(a.client_id, p.client_id) = $${i++}`); vals.push(client_id); }
    if (project_id) { filters.push(`a.project_id = $${i++}`); vals.push(project_id); }
    if (status) { filters.push(`a.status = $${i++}`); vals.push(status); }
    if (priority) { filters.push(`a.priority = $${i++}`); vals.push(priority); }
    if (responsible) { filters.push(`a.responsible = $${i++}`); vals.push(responsible); }
    if (due === 'overdue') { filters.push(`a.due_date < CURRENT_DATE AND a.status <> 'finalizada'`); }
    if (scope) { filters.push(`a.visible_to_client = true AND COALESCE(a.client_id, p.client_id) = $${i++} AND (p.id IS NULL OR p.visible_to_client = true)`); vals.push(scope); }

    let sql = `SELECT a.*, COALESCE(a.client_id, p.client_id) AS effective_client_id, c.legal_name AS client_name, p.name AS project_name
               FROM activities a
               LEFT JOIN projects p ON p.id = a.project_id
               LEFT JOIN clients c ON c.id = COALESCE(a.client_id, p.client_id)`;
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
    const r = await query(
      `SELECT a.*, COALESCE(a.client_id, p.client_id) AS effective_client_id,
              c.legal_name AS client_name, p.visible_to_client AS project_visible_to_client, p.name AS project_name
       FROM activities a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN clients c ON c.id = COALESCE(a.client_id, p.client_id)
       WHERE a.id = $1`,
      [req.params.id]
    );
    const a = r.rows[0];
    if (!a) return res.status(404).json({ error: 'No encontrada' });
    const scope = clientScope(req);
    if (scope && (scope !== a.effective_client_id || !a.visible_to_client || (a.project_id && !a.project_visible_to_client))) {
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
    const allowed = ['project_id','client_id','title','description','responsible','status','priority','start_date','due_date','estimated_hours','progress','billable','visible_to_client'];
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const oldR = await query('SELECT * FROM activities WHERE id = $1', [req.params.id]);
    const old = oldR.rows[0];
    if (!old) return res.status(404).json({ error: 'Actividad no encontrada' });

    const nextProjectId = req.body.project_id !== undefined ? req.body.project_id : old.project_id;
    let nextClientId = req.body.client_id !== undefined ? req.body.client_id : old.client_id;
    if (nextProjectId) {
      const p = await query('SELECT client_id FROM projects WHERE id = $1', [nextProjectId]);
      if (!p.rows[0]) return res.status(400).json({ error: 'Proyecto no encontrado' });
      if (nextClientId && nextClientId !== p.rows[0].client_id) {
        return res.status(400).json({ error: 'El cliente no coincide con el proyecto seleccionado' });
      }
      req.body.client_id = p.rows[0].client_id;
    } else if (req.body.client_id === undefined && nextClientId === old.client_id) {
      req.body.client_id = nextClientId || null;
    }
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

// Eliminación física de actividad y subtareas. Conserva horas/citas desvinculándolas.
router.post(
  '/:id/delete',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const deleted = await transaction(async (client) => {
      const idsR = await client.query<{ id: string }>(
        `WITH RECURSIVE tree AS (
           SELECT id FROM activities WHERE id = $1
           UNION ALL
           SELECT a.id FROM activities a JOIN tree t ON a.parent_activity_id = t.id
         )
         SELECT id FROM tree`,
        [req.params.id]
      );
      const ids = idsR.rows.map((r) => r.id);
      if (ids.length === 0) throw new ApiError(404, 'Actividad no encontrada');

      await client.query('UPDATE time_entries SET activity_id = NULL WHERE activity_id = ANY($1::uuid[])', [ids]);
      await client.query('UPDATE appointments SET activity_id = NULL WHERE activity_id = ANY($1::uuid[])', [ids]);
      await client.query('UPDATE timers SET activity_id = NULL WHERE activity_id = ANY($1::uuid[])', [ids]);
      await client.query('DELETE FROM updates WHERE activity_id = ANY($1::uuid[])', [ids]);
      await client.query("DELETE FROM files WHERE entity_type = 'activities' AND entity_id = ANY($1::uuid[])", [ids]);
      await client.query('DELETE FROM activities WHERE id = ANY($1::uuid[])', [ids]);
      return ids;
    });

    audit({
      user_id: (req as any).user.uid,
      action: 'delete',
      entity: 'activities',
      entity_id: req.params.id,
      new_values: { deleted_ids: deleted }
    });
    res.json({ ok: true, deleted });
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
