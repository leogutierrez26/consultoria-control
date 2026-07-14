-- Migración 003: actividades independientes
-- Permite crear actividades sin proyecto asociado.

ALTER TABLE activities ALTER COLUMN project_id DROP NOT NULL;
