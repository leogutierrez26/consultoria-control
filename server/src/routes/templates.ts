import { Router } from 'express';
import { requireAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';

const router = Router();

// RF-CON-004 Plantillas de correo (CRUD)
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const r = await query('SELECT * FROM email_templates ORDER BY key');
    res.json({ templates: r.rows });
  })
);

router.put(
  '/:key',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { subject, body } = req.body;
    await query(
      `INSERT INTO email_templates (key, subject, body, updated_at) VALUES ($1,$2,$3,NOW())
       ON CONFLICT (key) DO UPDATE SET subject=$2, body=$3, updated_at=NOW()`,
      [req.params.key, subject, body]
    );
    res.json({ ok: true });
  })
);

export default router;
