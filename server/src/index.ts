import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { pool } from './db';
import { runMigrations } from './migrate';

import authRoutes from './routes/auth';
import clientsRoutes from './routes/clients';
import usersRoutes from './routes/users';
import projectsRoutes from './routes/projects';
import activitiesRoutes from './routes/activities';
import updatesRoutes from './routes/updates';
import availabilityRoutes from './routes/availability';
import appointmentsRoutes from './routes/appointments';
import hoursRoutes from './routes/hours';
import reportsRoutes from './routes/reports';
import notificationsRoutes from './routes/notifications';
import auditRoutes from './routes/audit';
import configRoutes from './routes/config';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(morgan('dev'));

// Health check (RF-TEC-011)
app.get('/health', async (_req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'degraded', db: 'down', error: (e as Error).message });
  }
});

// Montaje de módulos (RF-TEC-003)
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/hours', hoursRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/config', configRoutes);

// Documentación OpenAPI (RF-TEC-004)
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Consultoría Control API',
      version: '1.1.0',
      description:
        'API REST documentada de Consultoría Control (gestión de consultoría, proyectos, actividades, agenda, horas, comunicaciones y reportes).'
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: ['./src/routes/*.ts']
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Catch-all
app.use((_req, res) => res.status(404).json({ error: 'No encontrado' }));

async function start(): Promise<void> {
  try {
    await runMigrations();
  } catch (e) {
    console.error('No se pudieron aplicar migraciones:', (e as Error).message);
  }
  app.listen(config.apiPort, () => {
    console.log(`[server] Consultoría Control API escuchando en puerto ${config.apiPort}`);
    console.log(`[server] Docs: http://localhost:${config.apiPort}/api-docs`);
  });
}

start();

export default app;
