-- Migración 006: contratos recurrentes de bolsa de horas.

CREATE TABLE IF NOT EXISTS hour_bank_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  name TEXT NOT NULL,
  hours_included NUMERIC(10,2) NOT NULL DEFAULT 0,
  monthly_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_center TEXT NOT NULL DEFAULT 'Bolsa de horas mensual',
  billing_day INT NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 31),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','pausada','cancelada','archivada')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hour_bank_subscriptions_client ON hour_bank_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_hour_bank_subscriptions_period ON hour_bank_subscriptions(start_date, end_date);

INSERT INTO hour_bank_subscriptions (
  client_id, name, hours_included, monthly_fee, start_date, end_date, status, cost_center
)
SELECT
  id,
  'Bolsa mensual principal',
  hour_bank_contracted,
  hour_bank_monthly_fee,
  COALESCE(hour_bank_start, CURRENT_DATE),
  hour_bank_end,
  CASE WHEN hour_bank_enabled THEN 'activa' ELSE 'archivada' END,
  'Bolsa de horas mensual'
FROM clients c
WHERE (hour_bank_enabled = TRUE OR hour_bank_contracted > 0 OR hour_bank_monthly_fee > 0)
  AND NOT EXISTS (
    SELECT 1 FROM hour_bank_subscriptions h
    WHERE h.client_id = c.id AND h.name = 'Bolsa mensual principal'
  );
