import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireAdmin, currentClientId, isAdmin, ApiError } from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';

const router = Router();

// RF-DIS-001 / 002 Configurar disponibilidad (admin)
router.post(
  '/',
  requireAdmin,
  validate([
    body('start_time').matches(/^\d{2}:\d{2}$/),
    body('end_time').matches(/^\d{2}:\d{2}$/)
  ]),
  asyncHandler(async (req, res) => {
    const {
      day_of_week, specific_date, start_time, end_time,
      slot_minutes = 60, buffer_minutes = 0, min_anticipation_hours = 4,
      booking_horizon_days = 60
    } = req.body;
    if (day_of_week === undefined && !specific_date) {
      return res.status(400).json({ error: 'Debe indicar día de la semana o fecha específica' });
    }
    const id = uuid();
    await query(
      `INSERT INTO availability (id, day_of_week, specific_date, start_time, end_time, slot_minutes, buffer_minutes, min_anticipation_hours, booking_horizon_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, day_of_week ?? null, specific_date ?? null, start_time, end_time, slot_minutes, buffer_minutes, min_anticipation_hours, booking_horizon_days]
    );
    res.status(201).json({ availability: { id, ...req.body } });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const r = await query('SELECT * FROM availability ORDER BY day_of_week, specific_date, start_time');
    res.json({ availability: r.rows });
  })
);

// RF-CIT-001 Consultar espacios disponibles (cliente). No revela eventos privados (RN-008).
router.get(
  '/slots',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { from, to, duration = 60 } = req.query as any;
    if (!from || !to) return res.status(400).json({ error: 'Parámetros from y to requeridos' });

    // Disponibilidad publicada
    const avail = await query(
      `SELECT * FROM availability
       WHERE (specific_date BETWEEN $1::date AND $2::date)
          OR (day_of_week IS NOT NULL AND day_of_week = ANY(SELECT EXTRACT(DOW FROM d)::int FROM generate_series($1::date, $2::date, '1 day') d))`,
      [from, to]
    );

    // Citas confirmadas (bloquean) - RN-007
    const booked = await query(
      `SELECT start_time, end_time FROM appointments
       WHERE status IN ('confirmada','pendiente','reprogramada')
         AND start_time >= $1 AND start_time <= $2`,
      [from, to]
    );

    // Generar slots candidatos a partir de la disponibilidad semanal/específica
    const slots: any[] = [];
    const bookedIntervals = booked.rows.map((b) => ({ s: new Date(b.start_time), e: new Date(b.end_time) }));
    for (const a of avail.rows) {
      const dur = (a.slot_minutes || duration) as number;
      const start = a.start_time as string; // HH:MM
      const end = a.end_time as string;
      // Por cada día en rango que coincida con el día de la semana (o fecha específica)
      const days = await expandDays(from, to, a);
      for (const day of days) {
        let cursor = combine(day, start);
        const endTs = combine(day, end);
        while (cursor + dur * 60000 <= endTs) {
          const slotEnd = cursor + dur * 60000;
          const conflict = bookedIntervals.some(
            (b) => cursor < b.e.getTime() && slotEnd > b.s.getTime()
          );
          if (!conflict) {
            slots.push({ start: new Date(cursor).toISOString(), end: new Date(slotEnd).toISOString(), duration_min: dur });
          }
          cursor += dur * 60000;
        }
      }
    }
    res.json({ slots: slots.slice(0, 200) });
  })
);

async function expandDays(from: string, to: string, a: any): Promise<string[]> {
  // Devuelve las fechas (YYYY-MM-DD) en rango que aplican a esta regla de disponibilidad
  const out: string[] = [];
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T00:00:00');
  for (let d = new Date(f); d <= t; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (a.specific_date && a.specific_date === iso) out.push(iso);
    else if (a.day_of_week !== null && a.day_of_week === d.getDay()) out.push(iso);
  }
  return out;
}

function combine(day: string, hhmm: string): number {
  return new Date(`${day}T${hhmm}:00`).getTime();
}

export default router;
