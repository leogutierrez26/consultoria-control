import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { requireAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';
import { evaluateHourBank } from '../hourbank';

const router = Router();

function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : null;
}

async function usageFor(clientId: string, start?: string | null, end?: string | null) {
  const vals: any[] = [clientId];
  const filters = ['client_id = $1'];
  if (start) { filters.push(`work_date >= $${vals.length + 1}`); vals.push(start); }
  if (end) { filters.push(`work_date <= $${vals.length + 1}`); vals.push(end); }
  const used = await query(`SELECT COALESCE(SUM(duration_minutes),0) AS min FROM time_entries WHERE ${filters.join(' AND ')}`, vals);
  return parseInt(used.rows[0].min || '0', 10);
}

function enrichSubscription(row: any, consumedMin: number) {
  const contractedMin = Number(row.hours_included || 0) * 60;
  return {
    ...row,
    consumed_hours: +(consumedMin / 60).toFixed(2),
    available_hours: +Math.max(0, (contractedMin - consumedMin) / 60).toFixed(2),
    pct_consumed: contractedMin > 0 ? +((consumedMin / contractedMin) * 100).toFixed(1) : 0
  };
}

async function listSubscriptions(clientId?: string) {
  const vals: any[] = [];
  const filters = ["h.status <> 'archivada'"];
  if (clientId) { filters.push(`h.client_id = $${vals.length + 1}`); vals.push(clientId); }
  const r = await query(
    `SELECT h.*, c.legal_name AS client_name
     FROM hour_bank_subscriptions h
     JOIN clients c ON c.id = h.client_id
     WHERE ${filters.join(' AND ')}
     ORDER BY h.status = 'activa' DESC, h.start_date DESC, c.legal_name`,
    vals
  );
  const rows = [];
  for (const row of r.rows) {
    const consumed = await usageFor(row.client_id, dateOnly(row.start_date), dateOnly(row.end_date));
    rows.push(enrichSubscription(row, consumed));
  }
  return rows;
}

// Listar contratos recurrentes de bolsa de horas.
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const subscriptions = await listSubscriptions(req.query.client_id as string | undefined);
    res.json({ subscriptions });
  })
);

// Crear nuevo contrato recurrente.
router.post(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const {
      client_id, name = 'Bolsa mensual', hours_included = 0, monthly_fee = 0,
      cost_center = 'Bolsa de horas mensual', billing_day = 1, start_date,
      end_date, status = 'activa', notes
    } = req.body;
    if (!client_id || !start_date) return res.status(400).json({ error: 'Cliente e inicio son requeridos' });
    const id = uuid();
    await query(
      `INSERT INTO hour_bank_subscriptions
       (id, client_id, name, hours_included, monthly_fee, cost_center, billing_day, start_date, end_date, status, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
      [id, client_id, name, hours_included, monthly_fee, cost_center, billing_day, start_date, end_date || null, status, notes || null]
    );
    await syncClientCurrentSubscription(client_id);
    audit({ user_id: (req as any).user.uid, action: 'create', entity: 'hour_bank_subscriptions', entity_id: id, new_values: req.body });
    await evaluateHourBank(client_id);
    res.status(201).json({ subscription: { id } });
  })
);

// Editar contrato recurrente.
router.patch(
  '/subscriptions/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const allowed = ['name', 'hours_included', 'monthly_fee', 'cost_center', 'billing_day', 'start_date', 'end_date', 'status', 'notes'];
    const oldR = await query('SELECT * FROM hour_bank_subscriptions WHERE id = $1', [req.params.id]);
    const old = oldR.rows[0];
    if (!old) return res.status(404).json({ error: 'Suscripción no encontrada' });
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        sets.push(`${field} = $${i++}`);
        vals.push(field === 'end_date' && !req.body[field] ? null : req.body[field]);
      }
    }
    if (sets.length) {
      sets.push('updated_at = NOW()');
      vals.push(req.params.id);
      await query(`UPDATE hour_bank_subscriptions SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    }
    await syncClientCurrentSubscription(old.client_id);
    audit({ user_id: (req as any).user.uid, action: 'update', entity: 'hour_bank_subscriptions', entity_id: req.params.id, old_values: old, new_values: req.body });
    await evaluateHourBank(old.client_id);
    res.json({ ok: true });
  })
);

// Eliminar de la vista operativa: archiva el contrato y conserva trazabilidad.
router.post(
  '/subscriptions/:id/delete',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const oldR = await query('SELECT * FROM hour_bank_subscriptions WHERE id = $1', [req.params.id]);
    const old = oldR.rows[0];
    if (!old) return res.status(404).json({ error: 'Suscripción no encontrada' });
    await query("UPDATE hour_bank_subscriptions SET status = 'archivada', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await syncClientCurrentSubscription(old.client_id);
    audit({ user_id: (req as any).user.uid, action: 'delete', entity: 'hour_bank_subscriptions', entity_id: req.params.id, old_values: old });
    res.json({ ok: true });
  })
);

// Compatibilidad: consultar resumen del contrato activo de un cliente.
router.get(
  '/:clientId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const c = await query('SELECT * FROM clients WHERE id = $1', [req.params.clientId]);
    if (!c.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    const subs = await listSubscriptions(req.params.clientId);
    const active = subs.find((s) => s.status === 'activa') || subs[0] || null;
    res.json({
      enabled: !!active,
      contracted_hours: active?.hours_included || 0,
      monthly_fee: active?.monthly_fee || 0,
      start: active?.start_date || null,
      end: active?.end_date || null,
      consumed_hours: active?.consumed_hours || 0,
      available_hours: active?.available_hours || 0,
      pct_consumed: active?.pct_consumed || 0,
      active_subscription: active,
      subscriptions: subs
    });
  })
);

// Compatibilidad: actualiza o crea el contrato principal del cliente.
router.put(
  '/:clientId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { enabled, contracted, monthly_fee, start, end } = req.body;
    const existing = await query(
      `SELECT * FROM hour_bank_subscriptions
       WHERE client_id = $1 AND status <> 'archivada'
       ORDER BY status = 'activa' DESC, start_date DESC LIMIT 1`,
      [req.params.clientId]
    );
    if (existing.rows[0]) {
      await query(
        `UPDATE hour_bank_subscriptions
         SET hours_included = $1, monthly_fee = $2, start_date = $3, end_date = $4,
             status = $5, updated_at = NOW()
         WHERE id = $6`,
        [contracted || 0, monthly_fee || 0, start || new Date().toISOString().slice(0, 10), end || null, enabled ? 'activa' : 'pausada', existing.rows[0].id]
      );
    } else {
      await query(
        `INSERT INTO hour_bank_subscriptions
         (id, client_id, name, hours_included, monthly_fee, start_date, end_date, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`,
        [uuid(), req.params.clientId, 'Bolsa mensual principal', contracted || 0, monthly_fee || 0, start || new Date().toISOString().slice(0, 10), end || null, enabled ? 'activa' : 'pausada']
      );
    }
    await syncClientCurrentSubscription(req.params.clientId);
    await evaluateHourBank(req.params.clientId);
    res.json({ ok: true });
  })
);

async function syncClientCurrentSubscription(clientId: string) {
  const active = await query(
    `SELECT * FROM hour_bank_subscriptions
     WHERE client_id = $1 AND status = 'activa'
     ORDER BY start_date DESC LIMIT 1`,
    [clientId]
  );
  const s = active.rows[0];
  await query(
    `UPDATE clients SET hour_bank_enabled = $1, hour_bank_contracted = $2, hour_bank_monthly_fee = $3,
        hour_bank_start = $4, hour_bank_end = $5, updated_at = NOW()
     WHERE id = $6`,
    [!!s, s?.hours_included || 0, s?.monthly_fee || 0, s?.start_date || null, s?.end_date || null, clientId]
  );
}

export default router;
