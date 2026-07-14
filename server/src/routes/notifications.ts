import { Router } from 'express';
import { requireAuth, requireAdmin, currentClientId } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';
import { listAudit } from '../audit';

const router = Router();

// RF-NOT-005 Notificaciones del usuario
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const status = req.query.status as string;
    const vals: any[] = [(req as any).user.uid];
    const filters = ['user_id = $1'];
    if (status && status !== 'todas') { filters.push(`read_status = $${vals.length + 1}`); vals.push(status); }
    const r = await query(
      `SELECT * FROM notifications WHERE ${filters.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
      vals
    );
    res.json({ notifications: r.rows });
  })
);

router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query("UPDATE notifications SET read_status = 'leida' WHERE user_id = $1 AND read_status = 'no_leida'", [
      (req as any).user.uid
    ]);
    res.json({ ok: true });
  })
);

router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query("UPDATE notifications SET read_status = 'leida' WHERE id = $1 AND user_id = $2", [
      req.params.id,
      (req as any).user.uid
    ]);
    res.json({ ok: true });
  })
);

export default router;
