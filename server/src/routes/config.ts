import { Router } from 'express';
import { requireAuth, requireAdmin, currentClientId, isAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';

const router = Router();

// RF-CON-001 Datos del consultor + otras configuraciones
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query('SELECT key, value FROM settings');
    const map: Record<string, any> = {};
    for (const row of r.rows) map[row.key] = row.value;
    res.json({ settings: map });
  })
);

router.put(
  '/:key',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, JSON.stringify(req.body)]
    );
    res.json({ ok: true });
  })
);

// RF-DAS-001 Panel del administrador / RF-PCL-001 Panel del cliente
router.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const uid = (req as any).user.uid;

    if (rid) {
      // Panel cliente
      const projects = await query(
        `SELECT id, name, status, progress, visible_to_client FROM projects
         WHERE client_id = $1 AND visible_to_client = true ORDER BY created_at DESC`,
        [rid]
      );
      const upcoming = await query(
        `SELECT id, start_time, status, modality FROM appointments
         WHERE client_id = $1 AND start_time >= NOW() ORDER BY start_time LIMIT 5`,
        [rid]
      );
      const hours = await query(
        `SELECT COALESCE(SUM(duration_minutes),0) AS min FROM time_entries WHERE client_id = $1`,
        [rid]
      );
      res.json({
        role: 'client',
        projects: projects.rows,
        upcoming_appointments: upcoming.rows,
        hours_consumed: +(parseInt(hours.rows[0]?.min || '0') / 60).toFixed(2)
      });
    } else {
      // Panel admin
      const todayMin = await query(
        `SELECT COALESCE(SUM(duration_minutes),0) AS min FROM time_entries WHERE work_date = CURRENT_DATE`
      );
      const weekMin = await query(
        `SELECT COALESCE(SUM(duration_minutes),0) AS min FROM time_entries WHERE work_date >= date_trunc('week', CURRENT_DATE)`
      );
      const billableMonth = await query(
        `SELECT COALESCE(SUM(CASE WHEN billable THEN duration_minutes ELSE 0 END),0) AS min,
                COALESCE(SUM(CASE WHEN billable THEN duration_minutes * COALESCE(rate,0) ELSE 0 END),0) AS value
         FROM time_entries WHERE work_date >= date_trunc('month', CURRENT_DATE)`
      );
      const activeProjects = await query("SELECT COUNT(*) FROM projects WHERE status = 'en_ejecucion'");
      const overdue = await query("SELECT COUNT(*) FROM activities WHERE due_date < CURRENT_DATE AND status <> 'finalizada'");
      const pendingAppts = await query("SELECT COUNT(*) FROM appointments WHERE status = 'pendiente'");
      const timer = await query('SELECT id FROM timers WHERE user_id = $1', [uid]);
      res.json({
        role: 'admin',
        hours_today: +(parseInt(todayMin.rows[0].min) / 60).toFixed(2),
        hours_week: +(parseInt(weekMin.rows[0].min) / 60).toFixed(2),
        billable_hours_month: +(parseInt(billableMonth.rows[0].min) / 60).toFixed(2),
        billable_value_month: +parseFloat(billableMonth.rows[0].value || '0').toFixed(2),
        active_projects: parseInt(activeProjects.rows[0].count),
        overdue_activities: parseInt(overdue.rows[0].count),
        pending_appointments: parseInt(pendingAppts.rows[0].count),
        active_timer: timer.rows[0] || null
      });
    }
  })
);

export default router;
