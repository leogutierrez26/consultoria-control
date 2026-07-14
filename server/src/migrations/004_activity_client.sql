-- Migración 004: cliente directo en actividades
-- Permite relacionar una actividad con un cliente aunque no tenga proyecto.

ALTER TABLE activities ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

UPDATE activities a
SET client_id = p.client_id
FROM projects p
WHERE a.project_id = p.id
  AND a.client_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id);
