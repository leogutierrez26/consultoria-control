-- Migración 001: Esquema base de Consultoría Control
-- Ejecutada de forma idempotente mediante la tabla schema_migrations.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID,
  role TEXT NOT NULL CHECK (role IN ('admin','client')),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  title TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  client_type TEXT NOT NULL DEFAULT 'juridica' CHECK (client_type IN ('natural','juridica')),
  id_type TEXT,
  id_number TEXT,
  contact_name TEXT,
  email TEXT,
  billing_email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  default_rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  internal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_date DATE,
  estimated_end_date DATE,
  status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','pendiente','en_ejecucion','suspendido','finalizado','cancelado','archivado')),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baja','media','alta')),
  hour_budget NUMERIC(10,2),
  hourly_rate NUMERIC(12,2),
  responsible TEXT,
  progress INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, code)
);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  parent_activity_id UUID REFERENCES activities(id),
  title TEXT NOT NULL,
  description TEXT,
  responsible TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','programada','en_ejecucion','esperando_info','bloqueada','en_revision','finalizada','cancelada')),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baja','media','alta')),
  start_date DATE,
  due_date DATE,
  estimated_hours NUMERIC(10,2),
  progress INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  specific_date DATE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_minutes INT NOT NULL DEFAULT 60,
  buffer_minutes INT NOT NULL DEFAULT 0,
  min_anticipation_hours INT NOT NULL DEFAULT 4,
  booking_horizon_days INT NOT NULL DEFAULT 60,
  CONSTRAINT chk_availability_target CHECK (day_of_week IS NOT NULL OR specific_date IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID REFERENCES projects(id),
  activity_id UUID REFERENCES activities(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  modality TEXT NOT NULL DEFAULT 'presencial' CHECK (modality IN ('presencial','telefonica','videoconferencia','soporte_remoto','visita_tecnica','otra')),
  reason TEXT NOT NULL,
  description TEXT,
  meeting_link TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','confirmada','reprogramada','atendida','no_atendida','cancelada_cliente','cancelada_admin','rechazada')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  activity_id UUID REFERENCES activities(id),
  appointment_id UUID REFERENCES appointments(id),
  work_date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes INT NOT NULL,
  description TEXT,
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  rate NUMERIC(12,2),
  billing_status TEXT NOT NULL DEFAULT 'borrador' CHECK (billing_status IN ('borrador','confirmada','pendiente_facturar','en_informe','facturada','pagada','anulada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  activity_id UUID REFERENCES activities(id),
  description TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paused_at TIMESTAMPTZ,
  accumulated_seconds INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id),
  author_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'comentario' CHECK (type IN ('comentario','avance','solicitud_info','respuesta_cliente','cambio_estado','cambio_fecha','registro_horas','cita','correo_enviado','correo_recibido','archivo','nota_interna','evento_automatico')),
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'cliente' CHECK (visibility IN ('cliente','privada','seleccionados')),
  notify BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID REFERENCES activities(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta','cerrada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  sender_id UUID REFERENCES users(id),
  sender_email TEXT,
  body TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('saliente','entrante')),
  delivery_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (delivery_status IN ('pendiente','en_cola','enviado','entregado','rebotado','fallido','recibido','rechazado')),
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  message_uid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'cliente' CHECK (visibility IN ('cliente','privada','seleccionados')),
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read_status TEXT NOT NULL DEFAULT 'no_leida' CHECK (read_status IN ('no_leida','leida','archivada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_activities_project ON activities(project_id);
CREATE INDEX IF NOT EXISTS idx_activities_parent ON activities(parent_activity_id);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_client ON time_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_updates_activity ON updates(activity_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_files_entity ON files(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
