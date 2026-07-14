import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireAdmin, currentClientId, isAdmin, ApiError } from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';
import { sendMail, templates } from '../mail';
import { notify, notifyClient, notifyAdmins } from '../notifications';

const router = Router();

// RF-CIT-002 Crear cita (reserva). Valida disponibilidad justo antes (RN-010).
router.post(
  '/',
  requireAuth,
  validate([
    body('project_id').optional({ nullable: true }).isUUID(),
    body('start_time').isISO8601(),
    body('end_time').isISO8601(),
    body('reason').isString().notEmpty(),
    body('modality').optional().isString()
  ]),
  asyncHandler(async (req, res) => {
    const uid = (req as any).user.uid;
    const rid = currentClientId(req);
    const {
      project_id, activity_id, start_time, end_time, reason, description,
      modality = 'presencial', meeting_link
    } = req.body;

    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({ error: 'La hora de fin debe ser posterior a la de inicio' });
    }
    const duration_minutes = Math.round((new Date(end_time).getTime() - new Date(start_time).getTime()) / 60000);

    // Determinar cliente: admin puede indicar client_id; cliente usa el suyo (RN-004)
    let client_id = req.body.client_id;
    if (rid) client_id = rid;
    if (!client_id) {
      const p = project_id ? (await query('SELECT client_id FROM projects WHERE id = $1', [project_id])).rows[0] : null;
      if (!p) return res.status(400).json({ error: 'No se pudo determinar el cliente' });
      client_id = p.client_id;
    }
    if (rid && rid !== client_id) {
      return res.status(403).json({ error: 'No puede reservar para otro cliente' });
    }

    // RN-009 / RN-010: validación final de disponibilidad (no doble reserva)
    const conflict = await query(
      `SELECT id FROM appointments
       WHERE status IN ('confirmada','pendiente','reprogramada')
         AND client_id = $1
         AND start_time < $2 AND end_time > $3`,
      [client_id, end_time, start_time]
    );
    if (conflict.rows.length) {
      return res.status(409).json({ error: 'El intervalo ya no está disponible. Seleccione otro horario.' });
    }

    // Política de confirmación (RF-CIT-005) desde settings
    const pol = await query("SELECT value FROM settings WHERE key = 'booking_policy'");
    const autoConfirm = pol.rows[0] ? pol.rows[0].value.auto_confirm === true : false;
    const status = autoConfirm ? 'confirmada' : 'pendiente';

    const id = uuid();
    await query(
      `INSERT INTO appointments (id, client_id, project_id, activity_id, start_time, end_time, duration_minutes, modality, reason, description, meeting_link, status, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())`,
      [id, client_id, project_id || null, activity_id || null, start_time, end_time, duration_minutes, modality, reason, description, meeting_link, status, uid]
    );

    // Notificar
    const c = await query('SELECT legal_name, email FROM clients WHERE id = $1', [client_id]);
    if (c.rows[0] && c.rows[0].email) {
      const when = new Date(start_time).toLocaleString();
      if (status === 'confirmada') await sendMail({ to: c.rows[0].email, subject: 'Cita confirmada', html: templates.appointmentConfirmed(when) });
      else await sendMail({ to: c.rows[0].email, subject: 'Cita registrada', html: templates.appointmentCreated(c.rows[0].legal_name, when) });
    }
    await notifyClient(client_id, 'cita_creada', 'Nueva cita registrada', `Cita para ${new Date(start_time).toLocaleString()}`);
    await notifyAdmins('cita_creada', 'Nueva cita solicitada', `Cliente ${c.rows[0]?.legal_name || client_id}`);
    audit({ user_id: uid, action: 'create', entity: 'appointments', entity_id: id, new_values: { status }, ip_address: req.ip });
    res.status(201).json({ appointment: { id, status, start_time, end_time } });
  })
);

// RF-CIT-006 Confirmar / Rechazar / Atender / Cancelar
router.post(
  '/:id/:action(confirm|reject|attend|cancel_admin|cancel_client|reschedule)',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const r = await query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    const appt = r.rows[0];
    if (!appt) return res.status(404).json({ error: 'No encontrada' });
    if (rid && rid !== appt.client_id) return res.status(403).json({ error: 'No autorizado' });

    let status: string | null = null;
    let keepHistory = true;
    switch (req.params.action) {
      case 'confirm': status = 'confirmada'; break;
      case 'reject': status = 'rechazada'; break;
      case 'attend': status = 'atendida'; break;
      case 'cancel_admin': status = appt.status === 'cancelada_cliente' ? appt.status : 'cancelada_admin'; break;
      case 'cancel_client':
        if (!rid && !isAdmin(req)) return res.status(403).json({ error: 'No autorizado' });
        status = 'cancelada_cliente'; break;
      case 'reschedule':
        status = 'reprogramada'; break;
    }
    if (status) {
      await query('UPDATE appointments SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
      audit({ user_id: (req as any).user.uid, action: 'status_change', entity: 'appointments', entity_id: req.params.id, old_values: { status: appt.status }, new_values: { status } });
      const label: Record<string, string> = {
        confirmada: 'Cita confirmada', rechazada: 'Cita rechazada', atendida: 'Cita atendida',
        cancelada_admin: 'Cita cancelada', cancelada_cliente: 'Cita cancelada', reprogramada: 'Cita reprogramada'
      };
      await notifyClient(appt.client_id, 'cita_confirmada', label[status] || 'Cita actualizada', `Estado: ${status}`);
    }
    // RF-CIT-011 convertir cita atendida en entrada de tiempo
    if (req.params.action === 'attend') {
      // nada automático; el admin registra horas aparte (RF-HOR-013)
    }
    res.json({ ok: true, status });
  })
);

// Listar citas (admin todas; cliente solo las suyas)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const { client_id, project_id, status, from, to } = req.query as any;
    const filters: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (rid) { filters.push(`a.client_id = $${i++}`); vals.push(rid); }
    else if (client_id) { filters.push(`a.client_id = $${i++}`); vals.push(client_id); }
    if (project_id) { filters.push(`a.project_id = $${i++}`); vals.push(project_id); }
    if (status) { filters.push(`a.status = $${i++}`); vals.push(status); }
    if (from) { filters.push(`a.start_time >= $${i++}`); vals.push(`${from}T00:00:00`); }
    if (to) { filters.push(`a.start_time <= $${i++}`); vals.push(`${to}T23:59:59`); }
    let sql = `SELECT a.*, c.legal_name AS client_name, p.name AS project_name
               FROM appointments a
               JOIN clients c ON c.id = a.client_id
               LEFT JOIN projects p ON p.id = a.project_id`;
    if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
    sql += ' ORDER BY a.start_time DESC';
    const r = await query(sql, vals);
    res.json({ appointments: r.rows });
  })
);

export default router;
