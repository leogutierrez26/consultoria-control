import dotenv from 'dotenv';

dotenv.config();

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

export const config = {
  apiPort: parseInt(env('API_PORT', '4000'), 10),
  publicAppUrl: env('PUBLIC_APP_URL', 'http://localhost:3000'),
  jwtSecret: env('JWT_SECRET', 'cambiar-este-secreto-en-produccion'),
  jwtExpiresInSeconds: parseInt(env('JWT_EXPIRES_IN', '86400'), 10),
  maxLoginAttempts: parseInt(env('MAX_LOGIN_ATTEMPTS', '5'), 10),
  loginLockMinutes: parseInt(env('LOGIN_LOCK_MINUTES', '15'), 10),
  databaseUrl: env(
    'DATABASE_URL',
    'postgres://consultoria:consultoria@localhost:5432/consultoria'
  ),
  smtp: {
    host: env('SMTP_HOST', ''),
    port: parseInt(env('SMTP_PORT', '587'), 10),
    secure: env('SMTP_SECURE', 'false') === 'true',
    user: env('SMTP_USER', ''),
    pass: env('SMTP_PASS', ''),
    from: env('MAIL_FROM', 'no-reply@consultoriacontrol.app')
  },
  uploadDir: env('UPLOAD_DIR', '/uploads'),
  maxFileMb: parseInt(env('MAX_FILE_MB', '20'), 10),
  defaultTz: env('DEFAULT_TZ', 'America/Bogota'),
  // Si SMTP_HOST está vacío, simulamos el envío (no se manda correo real).
  mailSimulated: env('SMTP_HOST', '') === ''
};

export type AppConfig = typeof config;
