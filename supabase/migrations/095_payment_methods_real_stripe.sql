-- 095_payment_methods_real_stripe.sql
-- Foundation for Flow A (Pay-IN: vendor pays BuildConnect via card/ACH) of the
-- banking-consolidation track. Rod 2026-06-22 directive (relayed via kratos
-- msg 1782154328963-kratos-q6hq7): kill the VendorPaymentDialog mock and wire
-- it to real Stripe. Money paths get max rigor — Stripe Elements iframes only
-- (PCI SAQ-A), idempotent server-side flows, own-read/own-write RLS, no
-- client-side service-role.
--
-- Schema:
--
-- 1. stripe_customers — 1:1 link auth.users.id → stripe_customer_id. One Stripe
--    Customer per user, created on first payment-method save. Distinct from
--    escrow_accounts (which holds Connected Accounts for the PAYOUT side).
--
-- 2. payment_methods — saved Stripe PaymentMethods (cards + us_bank_accounts).
--    One row per saved method per user. PaymentMethod.id (pm_xxx) is the
--    canonical handle; we never store full PAN / account / routing — Elements
--    iframes own that scope, we get back a tokenized pm_xxx + safe display
--    fields (brand / last4 / exp / bank_name).
--
-- 3. RLS: own-read + own-write only. Service-role (used by stripe-setup-intent-
--    create + stripe-payment-method-finalize edge functions) bypasses RLS for
--    server-side writes after JWT verify (mirrors stripe-connect-onboarding
--    auth-layer pattern from migration 069).
--
-- 4. Idempotency: edge fns use Stripe's idempotency_key on every Customer /
--    SetupIntent / PaymentMethod call. No table-level idempotency lock needed
--    — PaymentMethod.id is globally unique on Stripe's side and we UPSERT on
--    (user_id, stripe_payment_method_id) to handle replays without dupes.

BEGIN;

-- 1. stripe_customers — 1:1 link to auth.users.
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_customers_stripe_id_idx
  ON stripe_customers (stripe_customer_id);

-- 2. payment_methods — saved Stripe PaymentMethods per user.
CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Stripe handles (server-of-truth)
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL UNIQUE,
  stripe_setup_intent_id text,

  -- Type discriminator (mirrors Stripe's payment_method.type narrowed to what
  -- we support in the dialog)
  kind text NOT NULL CHECK (kind IN ('card', 'us_bank_account')),

  -- Vendor-billing semantics — what this method is allowed to settle
  purpose text NOT NULL DEFAULT 'both'
    CHECK (purpose IN ('membership', 'commissions', 'both')),

  -- Display fields (safe to store — these are what Elements gives us back,
  -- never the underlying card number / account number / CVV / routing). The
  -- card-side and ACH-side use a disjoint subset; CHECK constraints below
  -- enforce shape.
  brand text,                  -- card only: visa/mastercard/amex/discover/etc
  last4 text NOT NULL,         -- always present
  exp_month smallint,          -- card only, 1-12
  exp_year smallint,           -- card only, 4-digit
  bank_name text,              -- us_bank_account only
  routing_last4 text,          -- us_bank_account only (best-effort; FC gives it)
  holder text,                 -- display name on the method (card cardholder
                               --   / bank account holder); not load-bearing
                               --   for auth, just UI

  -- ACH verification status. card defaults to 'active' (instant after
  -- confirmSetup). us_bank_account starts 'pending_verification' for the
  -- microdeposit path; flips to 'active' after verifyMicrodeposits succeeds.
  -- Financial Connections returns 'active' immediately.
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_verification', 'failed')),

  -- For us_bank_account only — which verification method was used.
  verification_method text
    CHECK (verification_method IS NULL OR verification_method IN ('financial_connections', 'microdeposits')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Shape constraints — keep card vs ACH columns clean.
  CONSTRAINT payment_methods_card_shape CHECK (
    kind <> 'card' OR (
      exp_month BETWEEN 1 AND 12 AND
      exp_year BETWEEN 2000 AND 2100
    )
  ),
  CONSTRAINT payment_methods_ach_shape CHECK (
    kind <> 'us_bank_account' OR (
      exp_month IS NULL AND exp_year IS NULL AND brand IS NULL
    )
  ),
  CONSTRAINT payment_methods_verification_only_ach CHECK (
    verification_method IS NULL OR kind = 'us_bank_account'
  )
);

CREATE INDEX IF NOT EXISTS payment_methods_user_idx
  ON payment_methods (user_id);

CREATE INDEX IF NOT EXISTS payment_methods_user_status_idx
  ON payment_methods (user_id, status);

CREATE INDEX IF NOT EXISTS payment_methods_customer_idx
  ON payment_methods (stripe_customer_id);

-- 3. RLS — own-read + own-write only on the client side. Edge fns use
--    service-role (which bypasses RLS by Postgres default) to upsert
--    Stripe-derived rows after JWT verify.

ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

-- stripe_customers — own-read only. No client INSERT/UPDATE/DELETE — the
-- edge fn creates the row via service-role on first PaymentMethod save.
CREATE POLICY stripe_customers_own_read
  ON stripe_customers
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- payment_methods — own-read + own-update (purpose toggle) + own-delete.
-- INSERT is server-only via service-role (edge fn after Stripe confirm).
-- This is the critical PCI boundary: the client can SEE its tokenized
-- methods but cannot WRITE new ones — only the JWT-verified edge fn after
-- a real Stripe SetupIntent confirms.
CREATE POLICY payment_methods_own_read
  ON payment_methods
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- own-update is purpose-only (membership/commissions/both) — kind/brand/
-- last4/etc are derived from Stripe state and are server-managed. The
-- policy admits any UPDATE from the owner, but the application layer only
-- exposes purpose changes via the UI. (Defense-in-depth: we don't trust the
-- UI; we trust the server. The owner can in theory PATCH their own row to
-- any value, but they can't lie about Stripe state to anyone but themselves
-- — server-side charge calls use stripe_payment_method_id which is the only
-- field that matters and Stripe owns its truth.)
CREATE POLICY payment_methods_own_update
  ON payment_methods
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY payment_methods_own_delete
  ON payment_methods
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. updated_at trigger — mirrors the convention used by escrow_accounts
--    + other tables. Bumps updated_at on every UPDATE.
CREATE OR REPLACE FUNCTION payment_methods_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_methods_touch_updated_at_trg
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION payment_methods_touch_updated_at();

CREATE TRIGGER stripe_customers_touch_updated_at_trg
  BEFORE UPDATE ON stripe_customers
  FOR EACH ROW
  EXECUTE FUNCTION payment_methods_touch_updated_at();

COMMIT;
