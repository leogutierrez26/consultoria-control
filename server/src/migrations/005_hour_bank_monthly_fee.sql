-- Migración 005: tarifa fija mensual para suscripciones de bolsa de horas.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS hour_bank_monthly_fee NUMERIC(12,2) NOT NULL DEFAULT 0;
