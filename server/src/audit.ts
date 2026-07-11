import { query } from './db';
import { v4 as uuid } from 'uuid';
import { AuditLog, AuditAction } from './types';

interface AuditInput {
  user_id: string | null;
  action: AuditAction;
  entity: string;
  entity_id?: string | null;
  old_values?: any;
  new_values?: any;
  ip_address?: string | null;
  user_agent?: string | null;
}

// Registra una acción crítica. Nunca lanza: los fallos de auditoría
// se registran en consola para no romper la operación de negocio.
export async function audit(input: AuditInput): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs
        (id, user_id, action, entity, entity_id, old_values, new_values, ip_address, user_agent, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [
        uuid(),
        input.user_id,
        input.action,
        input.entity,
        input.entity_id ?? null,
        input.old_values ? JSON.stringify(input.old_values) : null,
        input.new_values ? JSON.stringify(input.new_values) : null,
        input.ip_address ?? null,
        input.user_agent ?? null
      ]
    );
  } catch (err) {
    console.error('[AUDIT] fallo al registrar:', (err as Error).message);
  }
}

export async function listAudit(limit = 100, offset = 0): Promise<AuditLog[]> {
  const res = await query<AuditLog>(
    `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.rows;
}
