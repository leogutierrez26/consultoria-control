export interface User {
  id: string;
  client_id: string | null;
  role: 'admin' | 'client';
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
  client_type: string;
  id_type?: string;
  id_number?: string;
  contact_name?: string;
  email?: string;
  billing_email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  default_rate: number;
  status: string;
  internal_notes?: string;
}

export interface Project {
  id: string;
  client_id: string;
  code: string;
  name: string;
  description: string;
  start_date?: string;
  estimated_end_date?: string;
  status: string;
  priority: string;
  hour_budget: number | null;
  hourly_rate: number | null;
  responsible?: string;
  progress: number;
  visible_to_client: boolean;
}

export interface Activity {
  id: string;
  project_id: string;
  parent_activity_id: string | null;
  title: string;
  description: string | null;
  responsible?: string;
  status: string;
  priority: string;
  start_date?: string;
  due_date?: string;
  estimated_hours: number | null;
  progress: number;
  billable: boolean;
  visible_to_client: boolean;
}

export interface Appointment {
  id: string;
  client_id: string;
  project_id?: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  modality: string;
  reason: string;
  status: string;
}

export interface TimeEntry {
  id: string;
  client_id: string;
  project_id: string;
  duration_minutes: number;
  billable: boolean;
  work_date: string;
  description?: string;
  project_name?: string;
  client_name?: string;
}

export interface Update {
  id: string;
  activity_id: string;
  author_id: string;
  type: string;
  content: string;
  visibility: string;
  created_at: string;
}
