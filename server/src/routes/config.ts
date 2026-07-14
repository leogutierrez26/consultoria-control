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
        `SELECT id, code, name, status, progress, priority, estimated_end_date, visible_to_client FROM projects
         WHERE client_id = $1 AND visible_to_client = true ORDER BY created_at DESC`,
        [rid]
      );
      const upcoming = await query(
        `SELECT id, start_time, end_time, status, modality, reason FROM appointments
         WHERE client_id = $1 AND start_time >= NOW() ORDER BY start_time LIMIT 5`,
        [rid]
      );
      const hours = await query(
        `SELECT COALESCE(SUM(duration_minutes),0) AS min FROM time_entries WHERE client_id = $1`,
        [rid]
      );
      const openActivities = await query(
        `SELECT a.id, a.title, a.status, a.priority, a.due_date, a.progress, COALESCE(p.name, 'Sin proyecto') AS project_name
         FROM activities a LEFT JOIN projects p ON p.id = a.project_id
         WHERE COALESCE(a.client_id, p.client_id) = $1
           AND (p.id IS NULL OR p.visible_to_client = true)
           AND a.visible_to_client = true
           AND a.status NOT IN ('finalizada','cancelada')
         ORDER BY
           CASE WHEN a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
           a.due_date NULLS LAST,
           a.created_at DESC
         LIMIT 8`,
        [rid]
      );
      const recentUpdates = await query(
        `SELECT u.id, u.activity_id, u.type, u.content, u.created_at, a.title AS activity_title, COALESCE(p.name, 'Sin proyecto') AS project_name
         FROM updates u
         JOIN activities a ON a.id = u.activity_id
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE COALESCE(a.client_id, p.client_id) = $1
           AND (p.id IS NULL OR p.visible_to_client = true)
           AND a.visible_to_client = true
           AND u.visibility <> 'privada'
         ORDER BY u.created_at DESC
         LIMIT 6`,
        [rid]
      );
      res.json({
        role: 'client',
        projects: projects.rows,
        upcoming_appointments: upcoming.rows,
        hours_consumed: +(parseInt(hours.rows[0]?.min || '0') / 60).toFixed(2),
        open_activities: openActivities.rows,
        recent_updates: recentUpdates.rows
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
      const dueActivities = await query(
        `SELECT a.id, a.title, a.status, a.priority, a.due_date, a.progress,
                COALESCE(p.name, 'Sin proyecto') AS project_name, c.legal_name AS client_name
         FROM activities a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN clients c ON c.id = COALESCE(a.client_id, p.client_id)
         WHERE a.status NOT IN ('finalizada','cancelada')
           AND (a.due_date IS NULL OR a.due_date <= CURRENT_DATE + INTERVAL '7 days')
         ORDER BY
           CASE WHEN a.due_date IS NULL THEN 2 WHEN a.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
           a.due_date NULLS LAST,
           CASE a.priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
           a.created_at DESC
         LIMIT 10`
      );
      const upcomingAppointments = await query(
        `SELECT a.id, a.start_time, a.end_time, a.status, a.modality, a.reason, c.legal_name AS client_name
         FROM appointments a
         JOIN clients c ON c.id = a.client_id
         WHERE a.start_time >= NOW()
           AND a.status NOT IN ('cancelada_cliente','cancelada_admin','rechazada','atendida')
         ORDER BY a.start_time
         LIMIT 8`
      );
      const blockedActivities = await query(
        `SELECT a.id, a.title, a.status, a.due_date, COALESCE(p.name, 'Sin proyecto') AS project_name, c.legal_name AS client_name
         FROM activities a
         LEFT JOIN projects p ON p.id = a.project_id
         LEFT JOIN clients c ON c.id = COALESCE(a.client_id, p.client_id)
         WHERE a.status IN ('bloqueada','esperando_info')
         ORDER BY a.updated_at DESC
         LIMIT 8`
      );
      const projectRisks = await query(
        `SELECT p.id, p.name, p.code, p.status, p.progress, p.hour_budget, c.legal_name AS client_name,
                COALESCE(SUM(t.duration_minutes),0) AS consumed_minutes
         FROM projects p
         JOIN clients c ON c.id = p.client_id
         LEFT JOIN time_entries t ON t.project_id = p.id
         WHERE p.status IN ('pendiente','en_ejecucion','suspendido')
         GROUP BY p.id, c.legal_name
         HAVING (p.hour_budget IS NOT NULL AND p.hour_budget > 0 AND COALESCE(SUM(t.duration_minutes),0) / 60.0 >= p.hour_budget * 0.8)
            OR p.status = 'suspendido'
         ORDER BY
           CASE WHEN p.status = 'suspendido' THEN 0 ELSE 1 END,
           COALESCE(SUM(t.duration_minutes),0) DESC
         LIMIT 8`
      );
      res.json({
        role: 'admin',
        hours_today: +(parseInt(todayMin.rows[0].min) / 60).toFixed(2),
        hours_week: +(parseInt(weekMin.rows[0].min) / 60).toFixed(2),
        billable_hours_month: +(parseInt(billableMonth.rows[0].min) / 60).toFixed(2),
        billable_value_month: +parseFloat(billableMonth.rows[0].value || '0').toFixed(2),
        active_projects: parseInt(activeProjects.rows[0].count),
        overdue_activities: parseInt(overdue.rows[0].count),
        pending_appointments: parseInt(pendingAppts.rows[0].count),
        active_timer: timer.rows[0] || null,
        due_activities: dueActivities.rows,
        upcoming_appointments: upcomingAppointments.rows,
        blocked_activities: blockedActivities.rows,
        project_risks: projectRisks.rows
      });
    }
  })
);

export default router;
