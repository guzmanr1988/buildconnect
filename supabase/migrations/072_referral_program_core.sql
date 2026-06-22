-- 072_referral_program_core.sql
-- Referral program CORE schema — Phase 2 of stripe-connect-preview track.
--
-- Scope (kratos task_1781574203261_132, directive #4, 2026-06-16 msg
-- 1781574203384-kratos-cwtax):
--   Build the referral program tables with kratos-DOCUMENTED-DEFAULTS for
--   the 5 open questions captured in docs/referral-data-model.md so Rod is
--   not blocked. Each default is flagged with a "[KRATOS_DEFAULT — Rod can
--   flip at review]" code comment so flip-points are obvious.
--
-- Five open-question defaults baked in:
--   Q1: qualifying-event definition         → 'project_completed'  (project COMPLETED, not signed/funded)
--   Q2: approval workflow                   → admin-review         (status starts 'pending_review', not auto-payout)
--   Q3: anti-self-deal                      → CHECK referrer != referee + same_household boolean flag
--   Q4: per-referrer / global lifetime cap  → NONE                 (no caps)
--   Q5: referrer-not-yet-onboarded handling → ACCRUE & pay-on-onboard (status 'accrued_pending_onboard')
--
-- Naming coordinated with migration 069: referrer payouts ride
-- homeowner_payouts via the reason='referral' discriminator + related_ref
-- pointer to referral_payouts.id. One payout rail; referral_payouts is the
-- bookkeeping table, homeowner_payouts is the Stripe transfer record.
--
-- Iris-compat note: admin/referral-program tab (task_1781574212916_604)
-- reads from referral_bonus_overrides + referral_payouts. Column names
-- diverge from iris's first draft — see msg 1781574383792-hephaestus-or89m
-- for the alignment record (referee_id not referred_id, status not
-- payout_status, default lives in platform_settings.default_referral_bonus_cents).

BEGIN;

-- 1. Extend platform_settings singleton with referral-default column.
--    [KRATOS_DEFAULT — Rod can flip at review]: $500 = 50000 cents.
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS default_referral_bonus_cents integer
    NOT NULL DEFAULT 50000
    CHECK (default_referral_bonus_cents >= 0);

-- 2. referral_codes — invite-link / signup-code registry. One referrer can
--    have multiple codes (e.g. campaign-specific) but exactly one is_active
--    at a time per referrer. is_active enforcement happens app-side; this
--    table stores history.
CREATE TABLE IF NOT EXISTS referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);

CREATE INDEX IF NOT EXISTS referral_codes_referrer_idx
  ON referral_codes (referrer_id);

CREATE INDEX IF NOT EXISTS referral_codes_active_idx
  ON referral_codes (referrer_id) WHERE is_active;

-- 3. referral_attributions — permanent referee↔referrer binding.
--    PK on referee_id makes "permanent attribution" structurally impossible
--    to override: one row per referee ever, no re-attribution possible.
--    Anti-self-deal: CHECK ensures referrer != referee at write-time.
--    [KRATOS_DEFAULT — Rod can flip at review]: same_household flag is
--    captured at attribution-time for audit; payout gate checks it. Default
--    false; admin can toggle if a same-household relationship is later
--    discovered.
CREATE TABLE IF NOT EXISTS referral_attributions (
  referee_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_id uuid REFERENCES referral_codes(id) ON DELETE SET NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'signup_link'
    CHECK (source IN ('signup_link', 'invite_code', 'admin_assigned')),
  same_household boolean NOT NULL DEFAULT false,
  notes text,
  CHECK (referee_id <> referrer_id)
);

CREATE INDEX IF NOT EXISTS referral_attributions_referrer_idx
  ON referral_attributions (referrer_id);

-- 4. referral_bonus_overrides — per-referrer override of default bonus.
--    PK on referrer_id = one override per referrer (idempotent admin set).
--    Absence of row = use platform_settings.default_referral_bonus_cents.
--    [KRATOS_DEFAULT — Rod can flip at review]: no lifetime cap = no
--    additional cap-tracking columns; if a cap policy emerges later it
--    lands in a separate referral_caps table not as columns here.
CREATE TABLE IF NOT EXISTS referral_bonus_overrides (
  referrer_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bonus_cents integer NOT NULL CHECK (bonus_cents >= 0),
  reason text,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. referral_qualifying_events — log of events that trigger a payout.
--    [KRATOS_DEFAULT — Rod can flip at review]: qualifying_event default
--    'project_completed' (project COMPLETED, not contract signed / not
--    funded / not closed-sale). Insert happens in the project-completion
--    transition handler app-side; this table is the audit trail.
--    UNIQUE(referee_id, project_ref, qualifying_event) makes the event
--    idempotent — replaying the completion handler can't double-pay.
CREATE TABLE IF NOT EXISTS referral_qualifying_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_ref text NOT NULL,
  project_ref_type text NOT NULL DEFAULT 'project'
    CHECK (project_ref_type IN ('project', 'lead', 'financing_application', 'other')),
  qualifying_event text NOT NULL DEFAULT 'project_completed'
    CHECK (qualifying_event IN ('project_completed', 'contract_signed', 'funded', 'closed_sale', 'other')),
  amount_context_cents bigint CHECK (amount_context_cents IS NULL OR amount_context_cents >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referee_id, project_ref, qualifying_event)
);

CREATE INDEX IF NOT EXISTS referral_qualifying_events_referee_idx
  ON referral_qualifying_events (referee_id);

CREATE INDEX IF NOT EXISTS referral_qualifying_events_occurred_idx
  ON referral_qualifying_events (occurred_at DESC);

-- 6. referral_payouts — bookkeeping for referrer earnings.
--    [KRATOS_DEFAULT — Rod can flip at review] Q2 admin-review:
--    status starts 'pending_review' (NOT 'pending_processing') — admin
--    must approve before payout. UI/automation can downgrade to auto by
--    inserting at 'pending_processing' once Rod authorizes it.
--    [KRATOS_DEFAULT — Rod can flip at review] Q5 accrue-on-not-onboarded:
--    'accrued_pending_onboard' status exists for the case where the
--    referrer earned a bonus but hasn't completed Stripe Connect onboarding
--    yet. Payouts in this status get swept on account.updated → active
--    webhook events.
--    homeowner_payout_id FK ties bookkeeping → actual Stripe transfer
--    record in homeowner_payouts. Set NULL until the transfer is initiated.
--    UNIQUE(qualifying_event_id) makes one payout per qualifying event.
CREATE TABLE IF NOT EXISTS referral_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  qualifying_event_id uuid NOT NULL REFERENCES referral_qualifying_events(id) ON DELETE CASCADE,
  bonus_cents integer NOT NULL CHECK (bonus_cents >= 0),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN (
      'pending_review',           -- Q2 default: admin must approve
      'accrued_pending_onboard',  -- Q5 default: referrer not yet on Stripe Connect
      'pending_processing',       -- approved + waiting on payout cycle
      'paid',                     -- transfer succeeded
      'failed',                   -- transfer failed
      'rejected',                 -- admin denied (anti-self-deal, fraud, etc.)
      'reversed'                  -- post-payout reversal
    )),
  homeowner_payout_id uuid REFERENCES homeowner_payouts(id) ON DELETE SET NULL,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qualifying_event_id),
  CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS referral_payouts_referrer_idx
  ON referral_payouts (referrer_id);

CREATE INDEX IF NOT EXISTS referral_payouts_status_idx
  ON referral_payouts (status);

CREATE INDEX IF NOT EXISTS referral_payouts_referrer_status_idx
  ON referral_payouts (referrer_id, status);

-- RLS — all 5 new tables.
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_bonus_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_qualifying_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_payouts ENABLE ROW LEVEL SECURITY;

-- referral_codes: referrer reads + creates own codes; admin reads all.
DROP POLICY IF EXISTS referral_codes_own_read ON referral_codes;
CREATE POLICY referral_codes_own_read ON referral_codes
  FOR SELECT TO authenticated
  USING (
    referrer_id = auth.uid()
    OR (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS referral_codes_own_write ON referral_codes;
CREATE POLICY referral_codes_own_write ON referral_codes
  FOR INSERT TO authenticated
  WITH CHECK (referrer_id = auth.uid());

-- referral_attributions: referee reads own; referrer reads where they are
-- the referrer; admin reads all. Writes service-role only (signup handler).
DROP POLICY IF EXISTS referral_attributions_party_read ON referral_attributions;
CREATE POLICY referral_attributions_party_read ON referral_attributions
  FOR SELECT TO authenticated
  USING (
    referee_id = auth.uid()
    OR referrer_id = auth.uid()
    OR (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- referral_bonus_overrides: admin-only read+write (it's a per-customer
-- pricing decision; non-admins should not see other customers' bonuses).
DROP POLICY IF EXISTS referral_bonus_overrides_admin_all ON referral_bonus_overrides;
CREATE POLICY referral_bonus_overrides_admin_all ON referral_bonus_overrides
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- referral_qualifying_events: admin reads all; referee reads own;
-- referrer reads where their referee triggered it. Writes service-role only.
DROP POLICY IF EXISTS referral_qualifying_events_party_read ON referral_qualifying_events;
CREATE POLICY referral_qualifying_events_party_read ON referral_qualifying_events
  FOR SELECT TO authenticated
  USING (
    referee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM referral_attributions a
      WHERE a.referee_id = referral_qualifying_events.referee_id
        AND a.referrer_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- referral_payouts: referrer reads own; admin reads all. Writes
-- service-role only (payout processor / admin approval action).
DROP POLICY IF EXISTS referral_payouts_referrer_read ON referral_payouts;
CREATE POLICY referral_payouts_referrer_read ON referral_payouts
  FOR SELECT TO authenticated
  USING (
    referrer_id = auth.uid()
    OR (auth.jwt() ->> 'role') = 'admin'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- touch_updated_at triggers (function defined in 069).
DROP TRIGGER IF EXISTS referral_bonus_overrides_touch ON referral_bonus_overrides;
CREATE TRIGGER referral_bonus_overrides_touch
  BEFORE UPDATE ON referral_bonus_overrides
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS referral_payouts_touch ON referral_payouts;
CREATE TRIGGER referral_payouts_touch
  BEFORE UPDATE ON referral_payouts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;
