import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireAdmin, currentClientId, isAdmin, ApiError } from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';
import { sendMail, templates } from '../mail';
import { notifyClient, notifyAdmins } from '../notifications';

const router = Router();

function clientScope(req: any): string | null {
  return isAdmin(req) ? null : currentClientId(req);
}

// RF-PRY-001 Crear proyecto
router.post(
  '/',
  requireAdmin,
  validate([
    body('client_id').isUUID(),
    body('code').isString().notEmpty(),
    body('name').isString().notEmpty(),
    body('description').optional().isString()
  ]),
  asyncHandler(async (req, res) => {
    const id = uuid();
    const {
      client_id, code, name, description = '', start_date, estimated_end_date,
      status = 'borrador', priority = 'media', hour_budget, hourly_rate,
      responsible, visible_to_client = true
    } = req.body;
    await query(
      `INSERT INTO projects (id, client_id, code, name, description, start_date, estimated_end_date, status, priority, hour_budget, hourly_rate, responsible, visible_to_client, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())`,
      [id, client_id, code, name, description, start_date, estimated_end_date, status, priority, hour_budget, hourly_rate, responsible, visible_to_client]
    );
    audit({ user_id: (req as any).user.uid, action: 'create', entity: 'projects', entity_id: id, new_values: req.body, ip_address: req.ip, user_agent: req.headers['user-agent'] as string });

    const c = await query('SELECT legal_name, email FROM clients WHERE id = $1', [client_id]);
    if (c.rows[0] && visible_to_client && c.rows[0].email) {
      await sendMail({ to: c.rows[0].email, subject: 'Nuevo proyecto', html: templates.projectCreated(c.rows[0].legal_name, name) });
    }
    await notifyClient(client_id, 'proyecto_creado', `Proyecto creado: ${name}`);
    audit({ user_id: (req as any).user.uid, action: 'create', entity: 'projects', entity_id: id, new_values: req.body, ip_address: req.ip, user_agent: req.headers['user-agent'] as string });
    res.status(201).json({ project: { id, ...req.body } });
  })
);

// RF-PRY-003 Consultar proyectos (cliente solo los visibles y de su org)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = clientScope(req);
    let sql = `SELECT p.*, c.legal_name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id`;
    const vals: any[] = [];
    if (scope) {
      sql += ' WHERE p.client_id = $1 AND p.visible_to_client = true';
      vals.push(scope);
    }
    sql += ' ORDER BY p.created_at DESC';
    const r = await query(sql, vals);
    res.json({ projects: r.rows });
  })
);

// RF-PRY-002 / RF-PRY-009 Vista detallada
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = clientScope(req);
    const r = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    if (scope && (scope !== p.client_id || !p.visible_to_client)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const acts = await query('SELECT * FROM activities WHERE project_id = $1 ORDER BY created_at', [p.id]);
    const appts = await query('SELECT id, start_time, end_time, status FROM appointments WHERE project_id = $1 ORDER BY start_time DESC', [p.id]);
    const hours = await query(
      'SELECT SUM(duration_minutes) AS total_min, SUM(CASE WHEN billable THEN duration_minutes ELSE 0 END) AS billable_min FROM time_entries WHERE project_id = $1',
      [p.id]
    );
    res.json({ project: p, activities: acts.rows, appointments: appts.rows, hours: hours.rows[0] });
  })
);

// RF-PRY-004 Editar proyecto
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const allowed = ['name','description','start_date','estimated_end_date','status','priority','hour_budget','hourly_rate','responsible','progress','visible_to_client'];
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const oldR = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        sets.push((f === 'status' ? 'status' : f) + ` = $${i++}`);
        vals.push(req.body[f]);
      }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push('updated_at = NOW()');
    vals.push(req.params.id);
    await query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    audit({ user_id: (req as any).user.uid, action: 'update', entity: 'projects', entity_id: req.params.id, old_values: oldR.rows[0], new_values: req.body });
    res.json({ ok: true });
  })
);

// RF-PRY-005 Archivar (soft)
router.post(
  '/:id/archive',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await query("UPDATE projects SET status = 'archivado', updated_at = NOW() WHERE id = $1", [req.params.id]);
    audit({ user_id: (req as any).user.uid, action: 'update', entity: 'projects', entity_id: req.params.id, new_values: { status: 'archivado' } });
    res.json({ ok: true });
  })
);

export default router;
