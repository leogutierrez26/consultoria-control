import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import {
  requireAuth,
  requireAdmin,
  currentClientId,
  isAdmin,
  ApiError,
  hashPassword,
  signToken
} from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';
import { sendMail, templates } from '../mail';
import { config } from '../config';

const router = Router();

// RF-USR-001 Crear usuario cliente
router.post(
  '/',
  requireAdmin,
  validate([
    body('client_id').isUUID(),
    body('email').isEmail(),
    body('first_name').isString().notEmpty(),
    body('last_name').isString().notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const {
      client_id,
      email,
      first_name,
      last_name,
      title,
      phone,
      status = 'active'
    } = req.body;

    const dup = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (dup.rows.length) return res.status(409).json({ error: 'El correo ya está registrado' });

    const id = uuid();
    // Contraseña temporal; el usuario la establece vía invitación (RF-USR-001 paso 6)
    const tempPassword = uuid().slice(0, 12);
    await query(
      `INSERT INTO users (id, client_id, role, email, password_hash, first_name, last_name, title, phone, status, email_verified, created_at, updated_at)
       VALUES ($1,$2,'client',$3,$4,$5,$6,$7,$8,$9,false,NOW(),NOW())`,
      [id, client_id, email.toLowerCase(), hashPassword(tempPassword), first_name, last_name, title, phone, status]
    );
    const token = signToken({ uid: id, rid: client_id, role: 'client' });
    const url = `${config.publicAppUrl}/set-password?token=${token}`;
    await sendMail({ to: email, subject: 'Invitación a Consultoría Control', html: templates.invitation(first_name, url) });

    audit({
      user_id: (req as any).user.uid,
      action: 'create',
      entity: 'users',
      entity_id: id,
      new_values: { email, client_id },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] as string
    });
    res.status(201).json({ user: { id, email, client_id, first_name, last_name } });
  })
);

// Establecer contraseña desde invitación (token)
router.post(
  '/set-password',
  validate([body('token').isString(), body('next').isLength({ min: 6 })]),
  asyncHandler(async (req, res) => {
    const { token, next } = req.body;
    let payload;
    try {
      payload = require('../auth').verifyToken(token);
    } catch {
      return res.status(400).json({ error: 'Enlace inválido o expirado.' });
    }
    await query('UPDATE users SET password_hash = $1, email_verified = true, updated_at = NOW() WHERE id = $2', [
      hashPassword(next),
      payload.uid
    ]);
    audit({ user_id: payload.uid, action: 'password_change', entity: 'users', entity_id: payload.uid });
    res.json({ ok: true });
  })
);

// RF-USR-002 Editar usuario
router.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const allowed = ['first_name', 'last_name', 'title', 'phone', 'status', 'client_id'];
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${i++}`);
        vals.push(req.body[f]);
      }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push('updated_at = NOW()');
    vals.push(req.params.id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    audit({ user_id: (req as any).user.uid, action: 'update', entity: 'users', entity_id: req.params.id, new_values: req.body });
    res.json({ ok: true });
  })
);

// RF-USR-003 Activar/desactivar
router.post(
  '/:id/:action(activate|deactivate)',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = req.params.action === 'activate' ? 'active' : 'inactive';
    await query('UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
    audit({ user_id: (req as any).user.uid, action: 'update', entity: 'users', entity_id: req.params.id, new_values: { status } });
    res.json({ ok: true });
  })
);

// Listar usuarios (admin ve todos; cliente ve los de su org)
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const scope = isAdmin(req) ? null : currentClientId(req);
    const sql = scope
      ? 'SELECT id, client_id, email, first_name, last_name, title, phone, status, role FROM users WHERE client_id = $1 ORDER BY first_name'
      : 'SELECT id, client_id, email, first_name, last_name, title, phone, status, role FROM users ORDER BY first_name';
    const r = await query(sql, scope ? [scope] : []);
    res.json({ users: r.rows });
  })
);

export default router;
