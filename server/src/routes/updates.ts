import { Router } from 'express';
import { body } from 'express-validator';
import { v4 as uuid } from 'uuid';
import { requireAuth, currentClientId, isAdmin, ApiError } from '../auth';
import { asyncHandler, validate } from '../middleware';
import { query } from '../db';
import { sendMail, templates } from '../mail';

const router = Router();

// RF-SEG-001 Registrar actualización
router.post(
  '/',
  requireAuth,
  validate([
    body('activity_id').isUUID(),
    body('content').isString().notEmpty(),
    body('type').optional().isString(),
    body('visibility').optional().isIn(['cliente', 'privada', 'seleccionados'])
  ]),
  asyncHandler(async (req, res) => {
    const { activity_id, content, type = 'comentario', visibility = 'cliente', notify = false } = req.body;
    const uid = (req as any).user.uid;
    const rid = currentClientId(req);

    // Validar acceso a la actividad
    const act = await query(
      `SELECT a.id, p.client_id, p.visible_to_client FROM activities a JOIN projects p ON p.id = a.project_id WHERE a.id = $1`,
      [activity_id]
    );
    if (!act.rows[0]) return res.status(404).json({ error: 'Actividad no encontrada' });
    const a = act.rows[0];
    if (rid && (rid !== a.client_id || !a.visible_to_client)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    // Un cliente solo puede crear visibilidad 'cliente' (no privada - RF-SEG-003)
    const finalVisibility = !isAdmin(req) && visibility === 'privada' ? 'cliente' : visibility;

    const id = uuid();
    await query(
      `INSERT INTO updates (id, activity_id, author_id, type, content, visibility, notify, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [id, activity_id, uid, type, content, finalVisibility, notify]
    );

    // RN-011: actualización privada no genera correo
    if (notify && finalVisibility !== 'privada' && a.client_id) {
      const c = await query('SELECT legal_name, email FROM clients WHERE id = $1', [a.client_id]);
      if (c.rows[0] && c.rows[0].email) {
        await sendMail({ to: c.rows[0].email, subject: 'Actualización de actividad', html: templates.activityUpdate(c.rows[0].legal_name, activity_id, content) });
      }
    }
    res.status(201).json({ update: { id, activity_id, content, type, visibility: finalVisibility } });
  })
);

// RF-SEG-004 Listar actualizaciones de una actividad (orden cronológico)
router.get(
  '/:activityId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rid = currentClientId(req);
    const act = await query('SELECT a.id, p.client_id, p.visible_to_client FROM activities a JOIN projects p ON p.id = a.project_id WHERE a.id = $1', [req.params.activityId]);
    if (!act.rows[0]) return res.status(404).json({ error: 'No encontrada' });
    const a = act.rows[0];
    if (rid && (rid !== a.client_id || !a.visible_to_client)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    // RF-SEG-003: cliente no ve privadas
    const sql = isAdmin(req)
      ? 'SELECT * FROM updates WHERE activity_id = $1 ORDER BY created_at'
      : "SELECT * FROM updates WHERE activity_id = $1 AND visibility <> 'privada' ORDER BY created_at";
    const r = await query(sql, [req.params.activityId]);
    res.json({ updates: r.rows });
  })
);

// RF-SEG-005 Edición dentro de ventana (aquí configurable: 24h)
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
router.patch(
  '/item/:id',
  requireAuth,
  validate([body('content').isString().notEmpty()]),
  asyncHandler(async (req, res) => {
    const r = await query('SELECT * FROM updates WHERE id = $1', [req.params.id]);
    const u = r.rows[0];
    if (!u) return res.status(404).json({ error: 'No encontrada' });
    if (u.author_id !== (req as any).user.uid && !isAdmin(req)) {
      return res.status(403).json({ error: 'Solo el autor o un admin puede editar' });
    }
    const created = new Date(u.created_at).getTime();
    if (Date.now() - created > EDIT_WINDOW_MS) {
      return res.status(400).json({ error: 'Ventana de edición expirada' });
    }
    await query('UPDATE updates SET content = $1 WHERE id = $2', [req.body.content, req.params.id]);
    res.json({ ok: true, note: 'Trazabilidad conservada (no se borra el original).' });
  })
);

export default router;
