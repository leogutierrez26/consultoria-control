import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireAdmin, currentClientId, isAdmin, ApiError, hashPassword } from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';
import { sendMail, templates } from '../mail';
import { config } from '../config';
import { Client } from '../types';

const router = Router();

// Middleware: un usuario cliente solo ve su propio cliente (RN-004)
function clientScope(req: any) {
  return isAdmin(req) ? null : currentClientId(req);
}

// RF-CLI-002 Consultar clientes
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = clientScope(req);
    const base = `SELECT c.*, (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count
                  FROM clients c`;
    const rows = scope
      ? await query<Client & { project_count: string }>(
          `${base} WHERE c.id = $1 ORDER BY c.legal_name`,
          [scope]
        )
      : await query<Client & { project_count: string }>(`${base} ORDER BY c.legal_name`);
    res.json({ clients: rows.rows });
  })
);

// RF-CLI-005 Perfil integral
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = clientScope(req);
    if (scope && scope !== req.params.id) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    const r = await query<Client>('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
    const client = r.rows[0];

    const projects = await query('SELECT * FROM projects WHERE client_id = $1 ORDER BY created_at DESC', [client.id]);
    const users = await query('SELECT id, first_name, last_name, email, title, status FROM users WHERE client_id = $1', [client.id]);
    const appts = await query(
      'SELECT id, start_time, end_time, status, modality FROM appointments WHERE client_id = $1 ORDER BY start_time DESC LIMIT 10',
      [client.id]
    );

    res.json({
      client,
      projects: projects.rows,
      users: users.rows,
      recent_appointments: appts.rows
    });
  })
);

// RF-CLI-001 Crear cliente
router.post(
  '/',
  requireAdmin,
  validate([
    body('legal_name').isString().notEmpty(),
    body('client_type').optional().isIn(['natural', 'juridica']),
    body('default_rate').optional().isNumeric(),
    body('email').optional({ nullable: true }).isEmail()
  ]),
  asyncHandler(async (req, res) => {
    const id = uuid();
    const {
      legal_name,
      client_type = 'juridica',
      id_type,
      id_number,
      contact_name,
      email,
      billing_email,
      phone,
      address,
      city,
      country,
      default_rate = 0,
      internal_notes
    } = req.body;
    await query(
      `INSERT INTO clients (id, legal_name, client_type, id_type, id_number, contact_name, email, billing_email, phone, address, city, country, default_rate, internal_notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
      [id, legal_name, client_type, id_type, id_number, contact_name, email, billing_email, phone, address, city, country, default_rate, internal_notes]
    );
    audit({
      user_id: (req as any).user.uid,
      action: 'create',
      entity: 'clients',
      entity_id: id,
      new_values: req.body,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] as string
    });
    res.status(201).json({ client: { id, ...req.body } });
  })
);

// RF-CLI-003 Editar cliente
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const fields = [
      'legal_name', 'client_type', 'id_type', 'id_number', 'contact_name',
      'email', 'billing_email', 'phone', 'address', 'city', 'country',
      'default_rate', 'internal_notes', 'status'
    ];
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    const oldR = await query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${i++}`);
        vals.push(req.body[f]);
      }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id);
    await query(`UPDATE clients SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    audit({
      user_id: (req as any).user.uid,
      action: 'update',
      entity: 'clients',
      entity_id: req.params.id,
      old_values: oldR.rows[0],
      new_values: req.body,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] as string
    });
    res.json({ ok: true });
  })
);

// RF-CLI-004 Desactivar cliente
router.post(
  '/:id/deactivate',
  requireAdmin,
  asyncHandler(async (req, res) => {
    await query("UPDATE clients SET status = 'inactive', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await query("UPDATE users SET status = 'inactive' WHERE client_id = $1", [req.params.id]);
    audit({ user_id: (req as any).user.uid, action: 'update', entity: 'clients', entity_id: req.params.id, new_values: { status: 'inactive' } });
    res.json({ ok: true });
  })
);

export default router;
