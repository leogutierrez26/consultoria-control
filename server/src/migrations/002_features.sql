-- Migración 002: mejoras del MVP y prioridad media
-- Idempotente vía schema_migrations.

-- RF-CLI-006 Bolsa de horas
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hour_bank_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hour_bank_contracted NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hour_bank_start DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hour_bank_end DATE;

-- RF-PRY-008 Alertas por consumo (umbrales configurables por proyecto)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS alert_threshold NUMERIC(5,2) NOT NULL DEFAULT 100;

-- RF-CON-004 Plantillas de correo (tabla nueva)
CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO email_templates (key, subject, body) VALUES
  ('invitation', 'Invitación a Consultoría Control', 'Hola {{name}}, acceda a su portal desde el enlace de invitación.'),
  ('reset_password', 'Restablecer contraseña', 'Use este enlace para restablecer su contraseña: {{link}}'),
  ('appointment_confirmed', 'Cita confirmada', 'Su cita del {{when}} ha sido confirmada.'),
  ('appointment_cancelled', 'Cita cancelada', 'Su cita del {{when}} ha sido cancelada.'),
  ('activity_update', 'Actualización de actividad', 'Nueva actualización en {{project}}: {{content}}')
ON CONFLICT (key) DO NOTHING;

-- RF-AGE-009 Eventos recurrentes (metadatos de recurrencia en availability)
ALTER TABLE availability ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;
ALTER TABLE availability ADD COLUMN IF NOT EXISTS recurrence_count INT;
ALTER TABLE availability ADD COLUMN IF NOT EXISTS recurrence_until DATE;

-- RF-AUT-006 Verificación de correo: bandera ya existe (email_verified).
-- Se añade índice para búsquedas de archivos por entidad.
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read_status);

-- RF-ARC: la tabla files ya existe; aseguramos ruta de almacenamiento relativa.
ALTER TABLE files ADD COLUMN IF NOT EXISTS storage_path TEXT;
