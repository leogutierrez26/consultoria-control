import { query } from './db';
import { notify, notifyClient, notifyAdmins } from './notifications';

// RF-CLI-006 / RF-PRY-008: recalcula consumo y dispara alertas en umbrales 70/85/100%.
export async function evaluateHourBank(clientId: string): Promise<void> {
  const c = await query('SELECT * FROM clients WHERE id = $1', [clientId]);
  const client = c.rows[0];
  if (!client) return;

  const subR = await query(
    `SELECT * FROM hour_bank_subscriptions
     WHERE client_id = $1 AND status = 'activa'
     ORDER BY start_date DESC LIMIT 1`,
    [clientId]
  );
  const subscription = subR.rows[0];
  if (!subscription && (!client.hour_bank_enabled || !client.hour_bank_contracted)) return;

  const start = subscription?.start_date || client.hour_bank_start;
  const end = subscription?.end_date || client.hour_bank_end;
  const vals: any[] = [clientId];
  const filters = ['client_id = $1'];
  if (start) { filters.push(`work_date >= $${vals.length + 1}`); vals.push(start); }
  if (end) { filters.push(`work_date <= $${vals.length + 1}`); vals.push(end); }
  const used = await query(
    `SELECT COALESCE(SUM(duration_minutes),0) AS min FROM time_entries WHERE ${filters.join(' AND ')}`,
    vals
  );
  const consumedMin = parseInt(used.rows[0].min || '0', 10);
  const contractedHours = subscription?.hours_included || client.hour_bank_contracted;
  const contractedMin = parseFloat(contractedHours) * 60;
  const pct = contractedMin > 0 ? (consumedMin / contractedMin) * 100 : 0;

  // Evita alertas repetidas: guardamos último umbral en settings por cliente.
  const key = `hourbank_alert_${clientId}`;
  const prev = await query('SELECT value FROM settings WHERE key = $1', [key]);
  const lastPct = prev.rows[0] ? prev.rows[0].value.last_pct : 0;

  for (const threshold of [70, 85, 100]) {
    if (pct >= threshold && lastPct < threshold) {
      const msg = `Bolsa de horas al ${threshold}% (${ (consumedMin / 60).toFixed(1) }/${contractedHours} h)`;
      await notifyClient(clientId, 'hora_consumida', msg);
      await notifyAdmins('hora_consumida', `Cliente ${client.legal_name}: ${msg}`);
    }
  }
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
    [key, JSON.stringify({ last_pct: pct })]
  );
}

// Al registrar horas, evaluar la bolsa del cliente afectado.
export async function evaluateAfterHours(clientId: string): Promise<void> {
  await evaluateHourBank(clientId);
}
