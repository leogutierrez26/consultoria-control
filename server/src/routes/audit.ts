import { Router } from 'express';
import { requireAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';

const router = Router();

// RF-AUD-003 Solo admin consulta auditoría
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const { action, entity, from, to } = req.query as any;
    const vals: any[] = [];
    const filters: string[] = [];
    if (action) { filters.push(`action = $${vals.length + 1}`); vals.push(action); }
    if (entity) { filters.push(`entity = $${vals.length + 1}`); vals.push(entity); }
    if (from) { filters.push(`created_at >= $${vals.length + 1}`); vals.push(`${from}T00:00:00`); }
    if (to) { filters.push(`created_at <= $${vals.length + 1}`); vals.push(`${to}T23:59:59`); }
    vals.push(limit, offset);
    const limitIdx = vals.length - 1;
    const offsetIdx = vals.length;
    let sql = `SELECT * FROM audit_logs`;
    if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
    sql += ` ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    const r = await query(sql, vals);
    res.json({ logs: r.rows });
  })
);

export default router;
