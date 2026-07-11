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
    const r = await query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [(req as any).user.uid]
    );
    res.json({ notifications: r.rows });
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
