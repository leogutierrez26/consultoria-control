import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireAdmin, currentClientId, isAdmin, ApiError } from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';

const router = Router();

// RF-HOR-001 Crear entrada manual
router.post(
  '/',
  requireAdmin,
  validate([
    body('client_id').isUUID(),
    body('project_id').isUUID(),
    body('work_date').isISO8601()
  ]),
  asyncHandler(async (req, res) => {
    const uid = (req as any).user.uid;
    const {
      client_id, project_id, activity_id, work_date, start_time, end_time,
      duration_minutes, description, billable = true, rate
    } = req.body;

    let dur = duration_minutes;
    // RF-HOR-002 cálculo automático
    if (!dur && start_time && end_time) {
      dur = Math.round((new Date(end_time).getTime() - new Date(start_time).getTime()) / 60000);
    }
    if (!dur || dur <= 0) return res.status(400).json({ error: 'Duración inválida' });

    // RN-013/RN-019 asociar a cliente y proyecto
    const id = uuid();
    await query(
      `INSERT INTO time_entries (id, user_id, client_id, project_id, activity_id, work_date, start_time, end_time, duration_minutes, description, billable, rate, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())`,
      [id, uid, client_id, project_id, activity_id || null, work_date.slice(0, 10), start_time || null, end_time || null, dur, description, billable, rate]
    );
    audit({ user_id: uid, action: 'hours_log', entity: 'time_entries', entity_id: id, new_values: { duration_minutes: dur, billable } });
    res.status(201).json({ entry: { id, duration_minutes: dur } });
  })
);

// RF-HOR-012 Detección de superposición (advertencia)
router.post(
  '/check-overlap',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { user_id, start_time, end_time } = req.body;
    const r = await query(
      `SELECT id FROM time_entries WHERE user_id = $1 AND start_time < $2 AND end_time > $3`,
      [user_id, end_time, start_time]
    );
    res.json({ overlap: r.rows.length > 0 });
  })
);

// Listar horas (admin todas o filtradas; cliente solo su cliente)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const { client_id, project_id, from, to } = req.query as any;
    const filters: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (rid) { filters.push(`t.client_id = $${i++}`); vals.push(rid); }
    else {
      if (client_id) { filters.push(`t.client_id = $${i++}`); vals.push(client_id); }
    }
    if (project_id) { filters.push(`t.project_id = $${i++}`); vals.push(project_id); }
    if (from) { filters.push(`t.work_date >= $${i++}`); vals.push(from); }
    if (to) { filters.push(`t.work_date <= $${i++}`); vals.push(to); }
    let sql = `SELECT t.*, p.name AS project_name, c.legal_name AS client_name FROM time_entries t
               JOIN projects p ON p.id = t.project_id JOIN clients c ON c.id = t.client_id`;
    if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
    sql += ' ORDER BY t.work_date DESC';
    const r = await query(sql, vals);
    res.json({ entries: r.rows });
  })
);

// RF-HOR-003 Iniciar cronómetro (uno por consultor - RN-018)
router.post(
  '/timer/start',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const uid = (req as any).user.uid;
    const { client_id, project_id, activity_id, description } = req.body;
    const existing = await query('SELECT * FROM timers WHERE user_id = $1', [uid]);
    if (existing.rows.length) return res.status(409).json({ error: 'Ya tiene un cronómetro activo' });
    const id = uuid();
    await query(
      `INSERT INTO timers (id, user_id, client_id, project_id, activity_id, description, started_at, accumulated_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),0)`,
      [id, uid, client_id, project_id, activity_id || null, description]
    );
    res.status(201).json({ timer: { id, started_at: new Date().toISOString() } });
  })
);

// RF-HOR-004 Pausar / reanudar
router.post(
  '/timer/:id/pause',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const r = await query('SELECT * FROM timers WHERE id = $1 AND user_id = $2', [req.params.id, (req as any).user.uid]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'No encontrado' });
    if (t.paused_at) {
      // reanudar: sumar tiempo transcurrido
      const extra = Math.round((Date.now() - new Date(t.paused_at).getTime()) / 1000);
      await query('UPDATE timers SET accumulated_seconds = accumulated_seconds + $1, paused_at = NULL WHERE id = $2', [extra, req.params.id]);
    } else {
      await query('UPDATE timers SET paused_at = NOW() WHERE id = $1', [req.params.id]);
    }
    res.json({ ok: true });
  })
);

// RF-HOR-005 Finalizar: consolida la entrada de tiempo
router.post(
  '/timer/:id/stop',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const uid = (req as any).user.uid;
    const r = await query('SELECT * FROM timers WHERE id = $1 AND user_id = $2', [req.params.id, uid]);
    const t = r.rows[0];
    if (!t) return res.status(404).json({ error: 'No encontrado' });
    let totalSec = t.accumulated_seconds;
    if (!t.paused_at) totalSec += Math.round((Date.now() - new Date(t.started_at).getTime()) / 1000);
    const duration_minutes = Math.max(1, Math.round(totalSec / 60));
    const work_date = t.started_at.toISOString().slice(0, 10);
    const id = uuid();
    await query(
      `INSERT INTO time_entries (id, user_id, client_id, project_id, activity_id, work_date, start_time, duration_minutes, description, billable, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
      [id, uid, t.client_id, t.project_id, t.activity_id, work_date, t.started_at.toISOString(), duration_minutes, req.body.description || t.description, req.body.billable !== false]
    );
    await query('DELETE FROM timers WHERE id = $1', [req.params.id]);
    audit({ user_id: uid, action: 'hours_log', entity: 'time_entries', entity_id: id, new_values: { from_timer: true, duration_minutes } });
    res.status(201).json({ entry: { id, duration_minutes } });
  })
);

// Estado del cronómetro activo
router.get(
  '/timer',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const r = await query('SELECT * FROM timers WHERE user_id = $1', [(req as any).user.uid]);
    res.json({ timer: r.rows[0] || null });
  })
);

export default router;
