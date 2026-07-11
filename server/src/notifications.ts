import { v4 as uuid } from 'uuid';
import { query } from './db';

type NotifyType =
  | 'cuenta_creada' | 'reset_password' | 'proyecto_creado' | 'actividad_asignada'
  | 'actualizacion' | 'solicitud_info' | 'respuesta_cliente' | 'cita_creada'
  | 'cita_confirmada' | 'cita_reprogramada' | 'cita_cancelada' | 'recordatorio_cita'
  | 'actividad_vencida' | 'hora_consumida' | 'archivo' | 'general';

// RF-NOT: crea una notificación interna para un usuario.
export async function notify(
  user_id: string,
  type: NotifyType,
  title: string,
  body?: string
): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (id, user_id, type, title, body, read_status, created_at)
       VALUES ($1,$2,$3,$4,$5,'no_leida',NOW())`,
      [uuid(), user_id, type, title, body]
    );
  } catch (e) {
    console.error('[NOTIFY] fallo:', (e as Error).message);
  }
}

// Notifica a todos los usuarios de un cliente (RF-NOT-003).
export async function notifyClient(client_id: string, type: NotifyType, title: string, body?: string): Promise<void> {
  const r = await query('SELECT id FROM users WHERE client_id = $1 AND status = $2', [client_id, 'active']);
  for (const u of r.rows) await notify(u.id, type, title, body);
}

// Notifica a todos los admins.
export async function notifyAdmins(type: NotifyType, title: string, body?: string): Promise<void> {
  const r = await query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  for (const u of r.rows) await notify(u.id, type, title, body);
}
