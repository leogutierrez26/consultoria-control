import { Router } from 'express';
import { requireAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { listAudit } from '../audit';

const router = Router();

// RF-AUD-003 Solo admin consulta auditoría
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);
    const rows = await listAudit(limit, offset);
    res.json({ logs: rows });
  })
);

export default router;
