-- 069_stripe_connect_express.sql
-- Stripe Connect Express foundation tables — Phase 1.
--
-- Scope (kratos approved 2026-06-16 msg 1781569611114-kratos-rt7wo):
--   Express both parties / test-mode-only on preview / US-only /
--   homeowner_payout_fee_bps default 0 (referrer keeps full referral payout) /
--   application_fee_bps stored in platform_settings + per-customer override
--   (Rod admin Referral-Program requirement) / Stripe secret key held in
--   Supabase Edge Function env (supabase secrets set ...) NOT a DB row.
--
-- Phase 1 deliverable: schema + plumbing only. NO Stripe API calls yet.
-- Phases 2+ (onboarding / fund / release / refund) gate on Rod-provided
-- test keys + fee decisions; until then escrow_accounts/holds/releases stay
-- empty by design.

BEGIN;

-- 1. platform_settings — singleton config row. The admin /settings page
--    currently binds inputs to React-local state with no persistence
--    (pre-existing bug surfaced 2026-06-16). This table fixes the Stripe-
--    relevant subset; the rest of the admin form stays local-state for now
--    and will migrate independently. Singleton enforced via PK = 1 and a
--    CHECK constraint.
CREATE TABLE IF NOT EXISTS platform_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  stripe_enabled boolean NOT NULL DEFAULT false,
  application_fee_bps smallint NOT NULL DEFAULT 0 CHECK (application_fee_bps BETWEEN 0 AND 10000),
  homeowner_payout_fee_bps smallint NOT NULL DEFAULT 0 CHECK (homeowner_payout_fee_bps BETWEEN 0 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 2. application_fee_overrides — per-customer override of platform fee.
--    Rod admin Referral-Program requirement: ability to set a custom
--    application fee per customer (e.g., reduced fee for a referred
--    homeowner, special program tier). NULL expires_at = no expiry.
CREATE TABLE IF NOT EXISTS application_fee_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  application_fee_bps smallint NOT NULL CHECK (application_fee_bps BETWEEN 0 AND 10000),
  reason text,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (customer_id)
);

CREATE INDEX IF NOT EXISTS application_fee_overrides_customer_idx
  ON application_fee_overrides (customer_id);

-- 3. escrow_accounts — Stripe Connected Account registry.
--    Unified across vendor and homeowner via party_type. One stripe_account_id
--    per (party_type, party_id) pair; UNIQUE pair enforces single Connect
--    account per party. status mirrors Stripe account state derived from
--    account.updated webhook events (Phase 2 wires the webhook handler).
CREATE TABLE IF NOT EXISTS escrow_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type text NOT NULL CHECK (party_type IN ('vendor', 'homeowner')),
  party_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id text NOT NULL UNIQUE,
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  requirements jsonb,
  status text NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'active', 'restricted', 'rejected')),
  onboarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (party_type, party_id)
);

CREATE INDEX IF NOT EXISTS escrow_accounts_party_idx
  ON escrow_accounts (party_type, party_id);

CREATE INDEX IF NOT EXISTS escrow_accounts_status_idx
  ON escrow_accounts (status);

-- 4. escrow_holds — customer-side payment captures held in escrow.
--    One row per fundEscrow call; links to financing_application that
--    triggered it. stripe_payment_intent_id is the Stripe PaymentIntent
--    that represents the held funds; customer_payment_url is the hosted
--    Checkout Session URL the customer pays at.
CREATE TABLE IF NOT EXISTS escrow_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financing_application_id uuid REFERENCES financing_applications(id) ON DELETE SET NULL,
  bc_escrow_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_checkout_session_id text UNIQUE,
  customer_payment_url text,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  description text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'funded', 'failed', 'cancelled', 'refunded')),
  funded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escrow_holds_app_idx
  ON escrow_holds (financing_application_id);

CREATE INDEX IF NOT EXISTS escrow_holds_status_idx
  ON escrow_holds (status);

-- 5. escrow_releases — milestone release transfers from escrow to vendor.
--    One row per releaseMilestone call; links to the draw_request being
--    released. application_fee_cents is the BuildConnect cut taken on this
--    release (computed at release-time from platform_settings or per-
--    customer override).
CREATE TABLE IF NOT EXISTS escrow_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_request_id uuid,
  escrow_hold_id uuid REFERENCES escrow_holds(id) ON DELETE SET NULL,
  destination_account_id uuid REFERENCES escrow_accounts(id) ON DELETE SET NULL,
  stripe_transfer_id text UNIQUE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  application_fee_cents bigint NOT NULL DEFAULT 0 CHECK (application_fee_cents >= 0),
  milestone_ref text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'released', 'failed', 'reversed')),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS escrow_releases_hold_idx
  ON escrow_releases (escrow_hold_id);

CREATE INDEX IF NOT EXISTS escrow_releases_status_idx
  ON escrow_releases (status);

-- 6. homeowner_payouts — referral + financing-disbursement payouts TO
--    homeowners (separate path from vendor releases; different audit/1099
--    requirements). reason discriminates the source so the audit trail
--    and 1099 reporting stay clean.
CREATE TABLE IF NOT EXISTS homeowner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homeowner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  destination_account_id uuid REFERENCES escrow_accounts(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('referral', 'financing_disbursement', 'other')),
  related_ref text,
  stripe_transfer_id text UNIQUE,
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'reversed')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS homeowner_payouts_homeowner_idx
  ON homeowner_payouts (homeowner_id);

CREATE INDEX IF NOT EXISTS homeowner_payouts_status_idx
  ON homeowner_payouts (status);

-- RLS — turn on for all six tables.
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_fee_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE homeowner_payouts ENABLE ROW LEVEL SECURITY;

-- platform_settings: admin-only read+write. Stripe-enabled flag is admin-
-- gated so non-admin agents can't toggle it. Read-only for any
-- authenticated user is intentional (UI surfaces "Stripe enabled: yes/no"
-- in non-admin contexts).
DROP POLICY IF EXISTS platform_settings_read ON platform_settings;
CREATE POLICY platform_settings_read ON platform_settings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS platform_settings_write ON platform_settings;
CREATE POLICY platform_settings_write ON platform_settings
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- application_fee_overrides: admin-only read+write.
DROP POLICY IF EXISTS application_fee_overrides_admin_all ON application_fee_overrides;
CREATE POLICY application_fee_overrides_admin_all ON application_fee_overrides
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- escrow_accounts: party reads own row; admin reads all; writes happen
-- service-role only (Edge Functions with SUPABASE_SERVICE_ROLE_KEY).
DROP POLICY IF EXISTS escrow_accounts_own_read ON escrow_accounts;
CREATE POLICY escrow_accounts_own_read ON escrow_accounts
  FOR SELECT TO authenticated
  USING (
    party_id = auth.uid()
    OR (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- escrow_holds: financing_application's homeowner reads via app linkage;
-- admin reads all; writes service-role only.
DROP POLICY IF EXISTS escrow_holds_admin_read ON escrow_holds;
CREATE POLICY escrow_holds_admin_read ON escrow_holds
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- escrow_releases: admin reads all; writes service-role only. Per-party
-- read access added in Phase 2 once we know the exact draw_request_id ↔
-- party_id join shape.
DROP POLICY IF EXISTS escrow_releases_admin_read ON escrow_releases;
CREATE POLICY escrow_releases_admin_read ON escrow_releases
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- homeowner_payouts: homeowner reads own rows; admin reads all; writes
-- service-role only.
DROP POLICY IF EXISTS homeowner_payouts_own_read ON homeowner_payouts;
CREATE POLICY homeowner_payouts_own_read ON homeowner_payouts
  FOR SELECT TO authenticated
  USING (
    homeowner_id = auth.uid()
    OR (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- updated_at triggers.
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_settings_touch ON platform_settings;
CREATE TRIGGER platform_settings_touch
  BEFORE UPDATE ON platform_settings
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS escrow_accounts_touch ON escrow_accounts;
CREATE TRIGGER escrow_accounts_touch
  BEFORE UPDATE ON escrow_accounts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS escrow_holds_touch ON escrow_holds;
CREATE TRIGGER escrow_holds_touch
  BEFORE UPDATE ON escrow_holds
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS escrow_releases_touch ON escrow_releases;
CREATE TRIGGER escrow_releases_touch
  BEFORE UPDATE ON escrow_releases
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS homeowner_payouts_touch ON homeowner_payouts;
CREATE TRIGGER homeowner_payouts_touch
  BEFORE UPDATE ON homeowner_payouts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
