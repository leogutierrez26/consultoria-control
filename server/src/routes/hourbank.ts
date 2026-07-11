import { Router } from 'express';
import { requireAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';
import { evaluateHourBank } from '../hourbank';

const router = Router();

// RF-CLI-006 Configurar bolsa de horas de un cliente
router.put(
  '/:clientId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { enabled, contracted, start, end } = req.body;
    await query(
      `UPDATE clients SET hour_bank_enabled = $1, hour_bank_contracted = $2, hour_bank_start = $3, hour_bank_end = $4
       WHERE id = $5`,
      [!!enabled, contracted || 0, start || null, end || null, req.params.clientId]
    );
    await evaluateHourBank(req.params.clientId);
    res.json({ ok: true });
  })
);

// Consultar consumo actual de la bolsa
router.get(
  '/:clientId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const c = await query('SELECT * FROM clients WHERE id = $1', [req.params.clientId]);
    const used = await query('SELECT COALESCE(SUM(duration_minutes),0) AS min FROM time_entries WHERE client_id = $1', [req.params.clientId]);
    const consumedMin = parseInt(used.rows[0].min || '0', 10);
    const contractedMin = parseFloat(c.rows[0].hour_bank_contracted || '0') * 60;
    res.json({
      enabled: c.rows[0].hour_bank_enabled,
      contracted_hours: c.rows[0].hour_bank_contracted,
      consumed_hours: +(consumedMin / 60).toFixed(2),
      available_hours: +Math.max(0, (contractedMin - consumedMin) / 60).toFixed(2),
      pct_consumed: contractedMin > 0 ? +((consumedMin / contractedMin) * 100).toFixed(1) : 0
    });
  })
);

export default router;
