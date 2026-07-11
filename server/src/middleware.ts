import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ApiError } from './auth';

// Envuelve handlers async para capturar errores y normalizar la respuesta (RF-TEC-003).
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      if (err instanceof ApiError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('[ERROR]', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    });
  };
}

// Valida el cuerpo con chain de express-validator y responde 400 si hay errores.
export function validate(
  chains: any[]
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(chains.map((c) => c.run(req)));
    const { validationResult } = require('express-validator');
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: result.array()
      });
    }
    next();
  };
}
