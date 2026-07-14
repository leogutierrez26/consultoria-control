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
    const { enabled, contracted, monthly_fee, start, end } = req.body;
    await query(
      `UPDATE clients SET hour_bank_enabled = $1, hour_bank_contracted = $2, hour_bank_monthly_fee = $3, hour_bank_start = $4, hour_bank_end = $5
       WHERE id = $6`,
      [!!enabled, contracted || 0, monthly_fee || 0, start || null, end || null, req.params.clientId]
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
    if (!c.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    const vals: any[] = [req.params.clientId];
    const filters = ['client_id = $1'];
    if (c.rows[0].hour_bank_start) { filters.push(`work_date >= $${vals.length + 1}`); vals.push(c.rows[0].hour_bank_start); }
    if (c.rows[0].hour_bank_end) { filters.push(`work_date <= $${vals.length + 1}`); vals.push(c.rows[0].hour_bank_end); }
    const used = await query(`SELECT COALESCE(SUM(duration_minutes),0) AS min FROM time_entries WHERE ${filters.join(' AND ')}`, vals);
    const consumedMin = parseInt(used.rows[0].min || '0', 10);
    const contractedMin = parseFloat(c.rows[0].hour_bank_contracted || '0') * 60;
    res.json({
      enabled: c.rows[0].hour_bank_enabled,
      contracted_hours: c.rows[0].hour_bank_contracted,
      monthly_fee: c.rows[0].hour_bank_monthly_fee,
      start: c.rows[0].hour_bank_start,
      end: c.rows[0].hour_bank_end,
      consumed_hours: +(consumedMin / 60).toFixed(2),
      available_hours: +Math.max(0, (contractedMin - consumedMin) / 60).toFixed(2),
      pct_consumed: contractedMin > 0 ? +((consumedMin / contractedMin) * 100).toFixed(1) : 0
    });
  })
);

export default router;
