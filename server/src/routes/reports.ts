import { Router } from 'express';
import { requireAuth, requireAdmin, currentClientId, isAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';

const router = Router();

function buildTimeFilters(
  req: any,
  alias = 't',
  startIndex = 1,
  includeProject = true
) {
  const rid = currentClientId(req);
  const { from, to, client_id, project_id, billable } = req.query as any;
  const filters: string[] = [];
  const vals: any[] = [];
  let i = startIndex;
  if (rid) { filters.push(`${alias}.client_id = $${i++}`); vals.push(rid); }
  else if (client_id) { filters.push(`${alias}.client_id = $${i++}`); vals.push(client_id); }
  if (includeProject && project_id) { filters.push(`${alias}.project_id = $${i++}`); vals.push(project_id); }
  if (from) { filters.push(`${alias}.work_date >= $${i++}`); vals.push(from); }
  if (to) { filters.push(`${alias}.work_date <= $${i++}`); vals.push(to); }
  if (billable === 'true' || billable === 'false') { filters.push(`${alias}.billable = $${i++}`); vals.push(billable === 'true'); }
  return { filters, vals, nextIndex: i, rid, client_id, project_id };
}

function buildJoinTimeConditions(req: any, alias = 't', startIndex = 1) {
  const { from, to, billable } = req.query as any;
  const conditions: string[] = [];
  const vals: any[] = [];
  let i = startIndex;
  if (from) { conditions.push(`${alias}.work_date >= $${i++}`); vals.push(from); }
  if (to) { conditions.push(`${alias}.work_date <= $${i++}`); vals.push(to); }
  if (billable === 'true' || billable === 'false') { conditions.push(`${alias}.billable = $${i++}`); vals.push(billable === 'true'); }
  return { conditions, vals, nextIndex: i };
}

// Reporte de horas por filtros (RF-REP-001)
router.get(
  '/hours',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { filters, vals } = buildTimeFilters(req);

    let sql = `SELECT t.*, p.name AS project_name, c.legal_name AS client_name
               FROM time_entries t JOIN projects p ON p.id=t.project_id JOIN clients c ON c.id=t.client_id`;
    if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
    sql += ' ORDER BY t.work_date DESC';
    const r = await query(sql, vals);

    const totalMin = r.rows.reduce((s: number, x: any) => s + x.duration_minutes, 0);
    const billableMin = r.rows.filter((x: any) => x.billable).reduce((s: number, x: any) => s + x.duration_minutes, 0);
    const nonBillableMin = totalMin - billableMin;
    res.json({
      entries: r.rows,
      summary: {
        total_hours: +(totalMin / 60).toFixed(2),
        billable_hours: +(billableMin / 60).toFixed(2),
        non_billable_hours: +(nonBillableMin / 60).toFixed(2),
        billable_percent: totalMin ? +((billableMin / totalMin) * 100).toFixed(1) : 0,
        entries_count: r.rows.length
      }
    });
  })
);

// Reporte por cliente (RF-REP-002)
router.get(
  '/by-client',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { client_id } = req.query as any;
    const join = buildJoinTimeConditions(req, 't', 1);
    const where: string[] = [];
    const vals = [...join.vals];
    let i = join.nextIndex;
    if (client_id) { where.push(`c.id = $${i++}`); vals.push(client_id); }

    const r = await query(
      `SELECT c.id, c.legal_name,
              COALESCE(SUM(t.duration_minutes),0) AS total_min,
              COALESCE(SUM(CASE WHEN t.billable THEN t.duration_minutes ELSE 0 END),0) AS billable_min,
              COUNT(DISTINCT t.project_id) AS projects,
              COUNT(t.id) AS entries
       FROM clients c
       LEFT JOIN time_entries t ON t.client_id = c.id${join.conditions.length ? ' AND ' + join.conditions.join(' AND ') : ''}
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       GROUP BY c.id, c.legal_name ORDER BY c.legal_name`,
      vals
    );
    res.json({ report: r.rows });
  })
);

// Reporte por proyecto (RF-REP-003)
router.get(
  '/by-project',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const { client_id } = req.query as any;
    const join = buildJoinTimeConditions(req, 't', 1);
    const vals = [...join.vals];
    const filters: string[] = [];
    let i = join.nextIndex;
    if (rid) { filters.push(`p.client_id = $${i++}`); vals.push(rid); }
    else if (client_id) { filters.push(`p.client_id = $${i++}`); vals.push(client_id); }

    let sql = `SELECT p.id, p.name, p.code, p.hour_budget, p.hourly_rate, p.status, c.legal_name AS client_name,
                COALESCE(SUM(t.duration_minutes),0) AS executed_min,
                COALESCE(SUM(CASE WHEN t.billable THEN t.duration_minutes ELSE 0 END),0) AS billable_min
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       LEFT JOIN time_entries t ON t.project_id = p.id${join.conditions.length ? ' AND ' + join.conditions.join(' AND ') : ''}`;
    if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
    sql += ' GROUP BY p.id, c.legal_name ORDER BY c.legal_name, p.name';
    const r = await query(sql, vals);
    res.json({ report: r.rows });
  })
);

// Reporte de agenda (RF-REP-004)
router.get(
  '/agenda',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const r = await query(
      `SELECT status, COUNT(*) AS count FROM appointments GROUP BY status`
    );
    const total = r.rows.reduce((s: number, x: any) => s + parseInt(x.count), 0);
    res.json({ appointments_by_status: r.rows, total });
  })
);

export default router;
