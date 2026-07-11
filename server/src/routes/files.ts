import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { requireAuth, isAdmin } from '../auth';
import { asyncHandler } from '../middleware';
import { query } from '../db';
import { audit } from '../audit';
import { config } from '../config';
import { User } from '../types';

const router = Router();
const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// memoryStorage: evita el cuelgue de diskStorage con rutas relativas.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxFileMb * 1024 * 1024 } });

function safeName(n: string): string {
  return n.replace(/[^\w\-. ]/g, '_').slice(0, 120) || 'archivo';
}

// RF-ARC-001 Adjuntar archivo a una entidad (multipart: entity_type, entity_id, visibility + file)
router.post(
  '/',
  requireAuth,
  (req, res, next) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  asyncHandler(async (req: any, res: any) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Archivo requerido' });
    const { entity_type, entity_id, visibility = 'cliente' } = req.body;
    if (!entity_type || !entity_id) {
      return res.status(400).json({ error: 'entity_type y entity_id requeridos' });
    }
    const u: any = (req as any).user;
    const stored = `${uuid()}-${safeName(f.originalname)}`;
    await fs.promises.writeFile(path.join(UPLOAD_DIR, stored), f.buffer);
    const id = uuid();
    await query(
      `INSERT INTO files (id, owner_id, entity_type, entity_id, original_name, stored_name, storage_path, mime_type, size_bytes, visibility, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
      [id, u.uid, entity_type, entity_id, f.originalname, stored, stored, f.mimetype, f.size,
       isAdmin(req) ? visibility : 'cliente']
    );
    audit({ user_id: u.uid, action: 'create', entity: 'files', entity_id: id, new_values: { entity_type, entity_id } });
    res.status(201).json({ file: { id, original_name: f.originalname, size: f.size, visibility } });
  })
);

// RF-ARC-006 Descargar (visibilidad respetada)
router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query('SELECT * FROM files WHERE id = $1 AND deleted = FALSE', [req.params.id]);
    const f = r.rows[0];
    if (!f) return res.status(404).json({ error: 'No encontrado' });
    if (f.visibility === 'privada' && !isAdmin(req)) return res.status(403).json({ error: 'No autorizado' });
    const full = path.join(UPLOAD_DIR, f.stored_name);
    if (!fs.existsSync(full)) return res.status(404).json({ error: 'Archivo no presente' });
    audit({ user_id: (req as any).user.uid, action: 'download', entity: 'files', entity_id: f.id });
    res.download(full, f.original_name);
  })
);

// RF-ARC-007 Eliminación lógica
router.post(
  '/:id/delete',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query('SELECT * FROM files WHERE id = $1 AND deleted = FALSE', [req.params.id]);
    const f = r.rows[0];
    if (!f) return res.status(404).json({ error: 'No encontrado' });
    if (!isAdmin(req) && f.owner_id !== (req as any).user.uid) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    await query('UPDATE files SET deleted = TRUE, deleted_at = NOW(), deleted_by = $1 WHERE id = $2',
      [(req as any).user.uid, req.params.id]);
    audit({ user_id: (req as any).user.uid, action: 'delete', entity: 'files', entity_id: f.id, new_values: { reason: req.body.reason } });
    res.json({ ok: true });
  })
);

// Listar archivos de una entidad
router.get(
  '/entity/:type/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = await query(
      `SELECT id, original_name, mime_type, size_bytes, visibility, created_at
       FROM files WHERE entity_type = $1 AND entity_id = $2 AND deleted = FALSE ORDER BY created_at DESC`,
      [req.params.type, req.params.id]
    );
    res.json({ files: r.rows });
  })
);

export default router;
