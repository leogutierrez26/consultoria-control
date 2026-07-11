// Tipos de dominio compartidos

export type Role = 'admin' | 'client';

export interface User {
  id: string;
  client_id: string | null;
  role: Role;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  title: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  email_verified: boolean;
  failed_attempts: number;
  locked_until: string | null; // timestamp ISO
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: string;
  client_id: string | null;
  role: Role;
  email: string;
  first_name: string;
  last_name: string;
  title: string | null;
  phone: string | null;
  status: 'active' | 'inactive';
  email_verified: boolean;
}

export interface Client {
  id: string;
  legal_name: string;
  client_type: 'natural' | 'juridica';
  id_type: string;
  id_number: string;
  contact_name: string | null;
  email: string | null;
  billing_email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  default_rate: number;
  status: 'active' | 'inactive';
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  client_id: string;
  code: string;
  name: string;
  description: string;
  start_date: string | null;
  estimated_end_date: string | null;
  status:
    | 'borrador'
    | 'pendiente'
    | 'en_ejecucion'
    | 'suspendido'
    | 'finalizado'
    | 'cancelado'
    | 'archivado';
  priority: 'baja' | 'media' | 'alta';
  hour_budget: number | null;
  hourly_rate: number | null;
  responsible: string | null;
  progress: number;
  visible_to_client: boolean;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  project_id: string;
  parent_activity_id: string | null;
  title: string;
  description: string | null;
  responsible: string | null;
  status:
    | 'pendiente'
    | 'programada'
    | 'en_ejecucion'
    | 'esperando_info'
    | 'bloqueada'
    | 'en_revision'
    | 'finalizada'
    | 'cancelada';
  priority: 'baja' | 'media' | 'alta';
  start_date: string | null;
  due_date: string | null;
  estimated_hours: number | null;
  progress: number;
  billable: boolean;
  visible_to_client: boolean;
  created_at: string;
  updated_at: string;
}

export type AuditAction =
  | 'login'
  | 'password_change'
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'date_change'
  | 'hours_log'
  | 'rate_change'
  | 'download'
  | 'permission_change';

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: AuditAction;
  entity: string;
  entity_id: string | null;
  old_values: any;
  new_values: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}
