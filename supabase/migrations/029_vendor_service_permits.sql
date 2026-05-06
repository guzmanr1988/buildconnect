-- PR #118 — fix-forward: ONE permit per service (not per option).
--
-- Rodolfo clarification on PR #117: "permit is only 1 line item to add the
-- price not in every single item". The per-option `permit_price_cents`
-- column on vendor_option_prices was the wrong shape. Replace with a
-- per-vendor-per-service flat permit value.
--
-- Two paired schema changes:
--
-- 1. CREATE TABLE vendor_service_permits — keyed (vendor_id, service_id),
--    one row per service the vendor offers. permit_price_cents is the
--    flat fee that vendor charges for permits on any project in that
--    service. sendProject() snapshots this single value (not a sum) onto
--    the breakdown's Permit Price line.
--
-- 2. DROP COLUMN vendor_option_prices.permit_price_cents — added in
--    migration 028 with the wrong shape. Drop is safe because PR #117
--    just shipped: any rows hermes filed have permit data, but those
--    values are about to be re-entered at the service-level by vendors.
--    No downstream consumer reads this column anymore (PR #118 client
--    drops the SELECT permit_price_cents).
--
-- All operations are idempotent (IF NOT EXISTS / IF EXISTS) so re-running
-- across environments is safe.

-- (1) New per-service permit table
CREATE TABLE IF NOT EXISTS vendor_service_permits (
  vendor_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id text NOT NULL,
  permit_price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, service_id)
);

-- RLS: vendors read/write their own rows; admins read all; homeowners
-- read all (they need to see the permit value during the booking flow).
ALTER TABLE vendor_service_permits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendor_service_permits'
      AND policyname = 'vendor_service_permits_select_all'
  ) THEN
    CREATE POLICY vendor_service_permits_select_all
      ON vendor_service_permits FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'vendor_service_permits'
      AND policyname = 'vendor_service_permits_vendor_write'
  ) THEN
    CREATE POLICY vendor_service_permits_vendor_write
      ON vendor_service_permits FOR ALL
      USING (vendor_id = auth.uid())
      WITH CHECK (vendor_id = auth.uid());
  END IF;
END $$;

-- (2) Drop the per-option permit column added in migration 028
ALTER TABLE vendor_option_prices
  DROP COLUMN IF EXISTS permit_price_cents;
