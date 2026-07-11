import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config';
import { query } from './db';
import { User } from './types';

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export interface JwtPayload {
  uid: string; // user id
  rid: string | null; // client_id
  role: 'admin' | 'client';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresInSeconds
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}

function extractToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

// Middleware: requiere sesión válida
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  try {
    const payload = verifyToken(token);
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
    return;
  }
}

// Middleware: requiere rol admin (ejecuta requireAuth internamente)
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    const u = (req as any).user as JwtPayload | undefined;
    if (!u) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    if (u.role !== 'admin') {
      res.status(403).json({ error: 'Acceso restringido al administrador' });
      return;
    }
    next();
  });
}

// Recupera el usuario completo desde la BD para validar estado activo/bloqueado.
export async function loadUser(userId: string): Promise<User | null> {
  const res = await query<User>('SELECT * FROM users WHERE id = $1', [userId]);
  return res.rows[0] || null;
}

// Helper: cliente actual (para restringir datos del cliente propio - RN-004)
export function currentClientId(req: Request): string | null {
  const u = (req as any).user as JwtPayload | undefined;
  return u ? u.rid : null;
}

export function isAdmin(req: Request): boolean {
  const u = (req as any).user as JwtPayload | undefined;
  return !!u && u.role === 'admin';
}

// Error de negocio estandarizado (RF-TEC-003)
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
