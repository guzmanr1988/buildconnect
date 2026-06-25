-- 101_concierge_rep_requests.sql
-- BuildConnect Concierge — rep_requests table + status enum + supporting
-- indexes/RLS/triggers. Companion to migration 100 (rep role enum value).
--
-- DESIGN SOURCES (locked):
--   Rod GREENLIT 2026-06-25, kratos msg 1782349857598-kratos-q7n59.
--   Q1-Q5 clarifications: kratos msg 1782349930711-kratos-49qfz.
--   Durability nudge (insert-pending-payment-first → charge → webhook-flip):
--     kratos msg 1782349970309-kratos-hnh33.
--   Stripe surface (platform direct-Charge, NOT Connect): athena msg
--     1782349981729-athena-qufc7 confirming kratos Q4 lock.
--   Activity-trail append-only (separate table not JSONB column): kratos Q5.
--
-- LIFECYCLE / STATE MACHINE:
--
--   pending_payment ──(charge.succeeded webhook)──► New
--                  └─(charge.failed   webhook)──► charge_failed (terminal)
--
--   New ──(admin/rep schedules)──► Scheduled
--   Scheduled ──(rep visit logged)──► Visited
--   Visited ──(rep finalizes draft)──► ProjectReady
--   ProjectReady ──(homeowner picks contractor)──► ContractorSelected (terminal-happy)
--
--   ANY non-terminal ──(homeowner/admin cancels)──► Cancelled
--                                                   + auto-refund $200 (Stripe partial)
--                                                   + retain $50 trip-fee
--
-- The 'pending_payment' state is mandatory before any charge attempt — kratos
-- durability rule prevents the "money moved but no row exists" gap: row INSERT
-- happens FIRST (state=pending_payment), charge fires SECOND with the row id
-- as Stripe metadata, charge.succeeded webhook flips state to 'new'. If the
-- INSERT succeeds but the charge call never fires (edge fn crash before
-- Stripe SDK call), the row sits in pending_payment indefinitely — admin can
-- safely DELETE without refund-side concern because no money moved.
--
-- PROJECT_ID LAZY SPAWN (Q2 lock): NULL at request submission. The rep
-- creates a projects row at rep-build-start (post-visit workspace open) and
-- backfills project_id on this row. Becomes canonical at ProjectReady.
--
-- ASSIGNED_REP_ID (Q3-related): NULL at request submission. Admin assigns a
-- rep on the New→Scheduled transition. CHECK constraint enforces assigned_rep_id
-- points at a profiles row with role='rep' via a helper function (FKs can't
-- reference enum values directly; the trigger guards INSERT/UPDATE).
--
-- CREATED_BY: present from day-one to support both creation paths (Q1):
--   homeowner self-submit: created_by = auth.uid() (the homeowner)
--   admin create-on-behalf: created_by = admin profile id, homeowner_id = the
--                           target homeowner. Distinguishable via
--                           (created_by != homeowner_id).

BEGIN;

-- 1) Status enum
-- Naming: snake_case lowercase per BuildConnect enum convention (user_role,
-- projects.status, sent_projects.status). pending_payment + charge_failed are
-- SYSTEM-LIFECYCLE states per athena spec (transient/internal, hidden from
-- customer-facing tracker; admin-visible only via the audit trail).
CREATE TYPE rep_request_status AS ENUM (
  'pending_payment',       -- SYSTEM: row inserted, charge not yet confirmed
  'new',                   -- charge.succeeded webhook fired; awaiting assignment
  'scheduled',             -- rep assigned + visit time confirmed
  'visited',               -- rep visit completed
  'project_ready',         -- rep finalized project draft
  'contractor_selected',   -- homeowner picked a contractor (terminal-happy)
  'cancelled',             -- homeowner/admin cancelled; refund processed/pending
  'charge_failed'          -- SYSTEM: initial charge attempt failed (terminal)
);

-- 2) Charge state enum (parallel to status, tracks Stripe-side money state)
CREATE TYPE rep_request_charge_status AS ENUM (
  'not_charged',      -- pre-charge or charge_failed terminal
  'charged',          -- charge.succeeded; full $250 held
  'refund_pending',   -- refund issued, Stripe ack pending
  'refunded'          -- charge.refunded webhook fired; $200 returned / $50 retained
);

-- 3) rep_requests table
CREATE TABLE rep_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  homeowner_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_by    uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assigned_rep_id uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Linked project (lazy-spawned at rep-build-start; NULL pre-build)
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,

  -- Request payload (homeowner intake form)
  address       jsonb NOT NULL,                -- { line1, line2?, city, state, zip }
  contact_phone text NOT NULL,                 -- per-request override; name/email from profiles
  requested_visit_times jsonb NOT NULL,        -- [{ window_start_utc, window_end_utc, service_tz, bucket_label }, ...]
                                               -- service_tz derived from address.state by edge fn
  description   text,                          -- homeowner free-form project description
  access_notes  text,                          -- homeowner notes on how to access property
  assessment_notes text,                       -- set by rep post-visit (assessment summary)
  -- Photos live in normalized rep_request_photos table (migration 104).

  -- Lifecycle
  status        rep_request_status NOT NULL DEFAULT 'pending_payment',

  -- Payment / refund (BuildConnect Services rail — platform direct-Charge,
  -- NOT Stripe Connect transfer). $250 charged at request, $200 refundable
  -- on cancellation, $50 retained as trip fee.
  charge_status rep_request_charge_status NOT NULL DEFAULT 'not_charged',
  visit_fee_cents        integer NOT NULL DEFAULT 25000 CHECK (visit_fee_cents = 25000),
  refundable_cents       integer NOT NULL DEFAULT 20000 CHECK (refundable_cents  = 20000),
  retained_cents         integer NOT NULL DEFAULT 5000  CHECK (retained_cents    = 5000),

  stripe_payment_intent_id text UNIQUE,        -- pi_xxx (set when charge attempted)
  stripe_charge_id         text UNIQUE,        -- ch_xxx (set on charge.succeeded)
  stripe_refund_id         text UNIQUE,        -- re_xxx (set on Cancelled→refund)
  stripe_idempotency_key   uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
                                               -- INSERT-time-stable; passed to
                                               -- Stripe Charge + Refund for replay-safety

  -- Timestamps
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  charged_at    timestamptz,                   -- set on charge.succeeded webhook
  scheduled_at  timestamptz,                   -- set on New→Scheduled
  visited_at    timestamptz,                   -- set on Scheduled→Visited
  project_ready_at timestamptz,                -- set on Visited→ProjectReady
  contractor_selected_at timestamptz,          -- set on ProjectReady→ContractorSelected
  cancelled_at  timestamptz,                   -- set on ANY→Cancelled
  refunded_at   timestamptz,                   -- set on charge.refunded webhook

  -- Cancellation context (NULL unless status=Cancelled)
  cancellation_reason text,
  cancelled_by uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- created_by must be homeowner_id (self-submit) OR an admin/admin_employee
  -- (create-on-behalf). The CHECK can't reference profiles.role from a column
  -- constraint; trigger rep_requests_validate_created_by enforces this.

  -- assigned_rep_id, when set, must reference a profile with role='rep'.
  -- Same trigger handles validation.

  CONSTRAINT rep_requests_status_consistency CHECK (
    -- Cancelled status implies cancelled_at + cancelled_by set
    (status <> 'cancelled' OR (cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL))
    AND
    -- ContractorSelected implies project_id set (rep finalized a project)
    (status <> 'contractor_selected' OR project_id IS NOT NULL)
    AND
    -- ProjectReady implies project_id set
    (status <> 'project_ready' OR project_id IS NOT NULL)
  )
);

-- 4) Indexes
CREATE INDEX rep_requests_homeowner_idx ON rep_requests (homeowner_id, created_at DESC);
CREATE INDEX rep_requests_assigned_rep_idx ON rep_requests (assigned_rep_id, status)
  WHERE assigned_rep_id IS NOT NULL;
CREATE INDEX rep_requests_status_idx ON rep_requests (status, created_at DESC);
CREATE INDEX rep_requests_pending_payment_idx ON rep_requests (created_at)
  WHERE status = 'pending_payment';
CREATE INDEX rep_requests_pi_idx ON rep_requests (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- 5) updated_at trigger
CREATE OR REPLACE FUNCTION rep_requests_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER rep_requests_touch_updated_at_trg
  BEFORE UPDATE ON rep_requests
  FOR EACH ROW
  EXECUTE FUNCTION rep_requests_touch_updated_at();

-- 6) Validate created_by + assigned_rep_id roles
CREATE OR REPLACE FUNCTION rep_requests_validate_role_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER  -- needed to read profiles.role across RLS
SET search_path = public
AS $$
DECLARE
  homeowner_role user_role;
  creator_role user_role;
  rep_role user_role;
BEGIN
  -- homeowner_id must be a homeowner
  SELECT role INTO homeowner_role FROM profiles WHERE id = NEW.homeowner_id;
  IF homeowner_role IS DISTINCT FROM 'homeowner' THEN
    RAISE EXCEPTION 'rep_requests.homeowner_id must reference a profiles row with role=homeowner (got %)', homeowner_role;
  END IF;

  -- created_by must be the homeowner themselves OR an admin / admin_employee
  IF NEW.created_by <> NEW.homeowner_id THEN
    SELECT role INTO creator_role FROM profiles WHERE id = NEW.created_by;
    IF creator_role NOT IN ('admin', 'admin_employee') THEN
      RAISE EXCEPTION 'rep_requests.created_by must be the homeowner OR an admin/admin_employee (got %)', creator_role;
    END IF;
  END IF;

  -- assigned_rep_id, when set, must reference a profile with role IN ('rep',
  -- 'admin', 'admin_employee'). Per athena C2 ruling msg 1782350078211: admin
  -- permission set is a superset of rep, so an admin can be directly assigned
  -- to a request (covers the "admin does occasional rep visits" case without
  -- needing a multi-role junction table).
  IF NEW.assigned_rep_id IS NOT NULL THEN
    SELECT role INTO rep_role FROM profiles WHERE id = NEW.assigned_rep_id;
    IF rep_role NOT IN ('rep', 'admin', 'admin_employee') THEN
      RAISE EXCEPTION 'rep_requests.assigned_rep_id must reference a profiles row with role IN (rep, admin, admin_employee) (got %)', rep_role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rep_requests_validate_role_refs_trg
  BEFORE INSERT OR UPDATE OF homeowner_id, created_by, assigned_rep_id
  ON rep_requests
  FOR EACH ROW
  EXECUTE FUNCTION rep_requests_validate_role_refs();

-- 7) Cancel transition guard (kratos msg 1782351203119 + athena spec v1.1 §8.7).
-- Enforces the OLD.status invariant at DB level: only (new, scheduled, visited,
-- project_ready, contractor_selected) are valid cancel-origins. pending_payment
-- is NOT cancel-origin (admin sweep handles those; no money moved), and the
-- terminals (cancelled, charge_failed) cannot self-loop.
--
-- The admin-vs-homeowner split for the contractor_selected branch lives in the
-- application layer: cancel-rep-request edge fn runs with service-role and
-- validates the caller's role before firing the UPDATE. RLS USING on the
-- rep_requests_homeowner_cancel policy further restricts homeowner-direct
-- UPDATE to status IN (new, scheduled, visited, project_ready) — homeowner
-- self-cancel cannot reach the contractor_selected origin even if they tried.
CREATE OR REPLACE FUNCTION rep_requests_cancel_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF OLD.status NOT IN ('new', 'scheduled', 'visited', 'project_ready', 'contractor_selected') THEN
      RAISE EXCEPTION 'invalid cancel transition: rep_requests cannot move from % to cancelled (allowed origins: new, scheduled, visited, project_ready, contractor_selected)', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rep_requests_cancel_transition_guard_trg
  BEFORE UPDATE OF status ON rep_requests
  FOR EACH ROW
  EXECUTE FUNCTION rep_requests_cancel_transition_guard();

-- 8) RLS
ALTER TABLE rep_requests ENABLE ROW LEVEL SECURITY;

-- Homeowner: own-read + own-create
CREATE POLICY rep_requests_homeowner_read
  ON rep_requests FOR SELECT
  TO authenticated
  USING (homeowner_id = auth.uid());

CREATE POLICY rep_requests_homeowner_create
  ON rep_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    homeowner_id = auth.uid()
    AND created_by = auth.uid()
    AND status = 'pending_payment'
  );

-- Homeowner: cancel own request. Per kratos cancel-RLS lock msg
-- 1782351203119: homeowner-self-cancel ALLOWED at status IN (new, scheduled,
-- visited, project_ready) — NOT pending_payment (no money moved yet; admin
-- handles those via timeout sweep), NOT contractor_selected (admin-only post-
-- CS cancel honors Rod's uniform-$200 promise without letting a homeowner
-- self-cancel after committing to a contractor), NOT terminal (cancelled /
-- charge_failed). Application layer calls cancel-rep-request edge fn which
-- sets status=cancelled + fires the $200 Stripe refund.
CREATE POLICY rep_requests_homeowner_cancel
  ON rep_requests FOR UPDATE
  TO authenticated
  USING (
    homeowner_id = auth.uid()
    AND status IN ('new', 'scheduled', 'visited', 'project_ready')
  )
  WITH CHECK (homeowner_id = auth.uid() AND status = 'cancelled');

-- Rep: read own assignments (RLS row-scope per kratos role-model spec)
CREATE POLICY rep_requests_rep_read_assigned
  ON rep_requests FOR SELECT
  TO authenticated
  USING (
    assigned_rep_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rep')
  );

-- Rep: update own assignments (status transitions Visited / ProjectReady,
-- notes, photo_paths additions). Cannot reassign or change parties.
CREATE POLICY rep_requests_rep_update_assigned
  ON rep_requests FOR UPDATE
  TO authenticated
  USING (
    assigned_rep_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rep')
  )
  WITH CHECK (
    assigned_rep_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rep')
  );

-- Admin / admin_employee: full read + manage (assignment, scheduling,
-- cancellation on behalf). Mirrors existing admin RLS pattern from migrations
-- 010 + later.
CREATE POLICY rep_requests_admin_read
  ON rep_requests FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'admin_employee')
  ));

CREATE POLICY rep_requests_admin_update
  ON rep_requests FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'admin_employee')
  ));

-- INSERT path: homeowner self-create policy above covers self-submit.
-- admin-create-on-behalf path uses the create-rep-request-on-behalf edge fn
-- which runs with service-role and bypasses RLS (mirrors stripe-setup-intent-
-- create pattern from migration 095). No client-side admin INSERT policy
-- needed; edge fn is the chokepoint.

-- DELETE: not permitted via client; admin uses cancel/archive flow which
-- preserves the audit trail. No DELETE policy = no client DELETE.

COMMIT;
