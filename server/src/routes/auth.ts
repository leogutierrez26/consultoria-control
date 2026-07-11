import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import {
  requireAuth,
  requireAdmin,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  currentClientId,
  isAdmin,
  ApiError
} from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';
import { sendMail, templates } from '../mail';
import { config } from '../config';
import { User, PublicUser } from '../types';

const router = Router();

function toPublic(u: User): PublicUser {
  return {
    id: u.id,
    client_id: u.client_id,
    role: u.role,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    title: u.title,
    phone: u.phone,
    status: u.status,
    email_verified: u.email_verified
  };
}

// RF-AUT-001 Inicio de sesión
router.post(
  '/login',
  validate([
    body('email').isEmail().withMessage('Correo inválido'),
    body('password').isString().notEmpty()
  ]),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const r = await query<User>('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = r.rows[0];

    // RF-AUT-005: bloqueo por intentos fallidos
    if (user) {
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(423).json({ error: 'Cuenta bloqueada temporalmente. Intente más tarde.' });
      }
      if (user.status !== 'active') {
        return res.status(403).json({ error: 'La cuenta no está activa.' });
      }
    }

    if (!user || !verifyPassword(password, user.password_hash)) {
      if (user) {
        const attempts = user.failed_attempts + 1;
        const lockUntil =
          attempts >= config.maxLoginAttempts
            ? new Date(Date.now() + config.loginLockMinutes * 60_000).toISOString()
            : null;
        await query(
          'UPDATE users SET failed_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3',
          [attempts, lockUntil, user.id]
        );
        audit({
          user_id: user.id,
          action: 'login',
          entity: 'users',
          entity_id: user.id,
          new_values: { result: 'fallido', attempts },
          ip_address: req.ip,
          user_agent: req.headers['user-agent'] as string
        });
      }
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // restablecer intentos
    await query(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1',
      [user.id]
    );
    audit({
      user_id: user.id,
      action: 'login',
      entity: 'users',
      entity_id: user.id,
      new_values: { result: 'exitoso' },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] as string
    });

    const token = signToken({
      uid: user.id,
      rid: user.client_id,
      role: user.role
    });
    res.json({ token, user: toPublic(user) });
  })
);

// RF-AUT-004 Cierre de sesión (stateless: el cliente descarta el token).
router.post('/logout', requireAuth, (_req, res) => {
  res.json({ ok: true, message: 'Sesión cerrada. Descarte el token en el cliente.' });
});

// RF-AUT-003 Cambio de contraseña (autenticado)
router.post(
  '/change-password',
  requireAuth,
  validate([
    body('current').isString().notEmpty(),
    body('next').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres')
  ]),
  asyncHandler(async (req, res) => {
    const { current, next } = req.body;
    const uid = (req as any).user.uid;
    const r = await query<User>('SELECT * FROM users WHERE id = $1', [uid]);
    const user = r.rows[0];
    if (!user || !verifyPassword(current, user.password_hash)) {
      return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
    }
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      hashPassword(next),
      uid
    ]);
    audit({ user_id: uid, action: 'password_change', entity: 'users', entity_id: uid });
    await sendMail({
      to: user.email,
      subject: 'Contraseña cambiada',
      html: templates.passwordChanged()
    });
    res.json({ ok: true });
  })
);

// RF-AUT-002 Recuperación de contraseña (solicita enlace)
router.post(
  '/forgot-password',
  validate([body('email').isEmail()]),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const r = await query<User>('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = r.rows[0];
    // No revelar si el correo existe (RF-AUT-002)
    if (user) {
      const token = signToken({ uid: user.id, rid: user.client_id, role: user.role });
      const url = `${config.publicAppUrl}/reset?token=${token}`;
      await sendMail({
        to: user.email,
        subject: 'Restablecer contraseña',
        html: templates.resetPassword(url)
      });
    }
    res.json({ ok: true, message: 'Si el correo existe, se ha enviado un enlace.' });
  })
);

// RF-AUT-002 Restablecer con token (único uso: se cambia contraseña y expira al renovar)
router.post(
  '/reset-password',
  validate([
    body('token').isString().notEmpty(),
    body('next').isLength({ min: 6 })
  ]),
  asyncHandler(async (req, res) => {
    const { token, next } = req.body;
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(400).json({ error: 'Enlace inválido o expirado.' });
    }
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [
      hashPassword(next),
      payload.uid
    ]);
    audit({ user_id: payload.uid, action: 'password_change', entity: 'users', entity_id: payload.uid });
    res.json({ ok: true });
  })
);

// Perfil propio (RF-USR-004)
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const uid = (req as any).user.uid;
    const r = await query<User>('SELECT * FROM users WHERE id = $1', [uid]);
    if (!r.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    res.json({ user: toPublic(r.rows[0]) });
  })
);

// RF-AUT-008 Gestión de sesiones: en stateless mostramos el payload del token actual.
router.get('/sessions', requireAuth, (req, res) => {
  res.json({
    current: (req as any).user,
    note: 'Sesiones activas gestionadas por tokens JWT en el cliente.'
  });
});

export default router;
