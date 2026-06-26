-- 108_concierge_rep_requests_calendar.sql
-- Intake Phase 2 — real calendar replacing availability-bucket model.
--
-- Rod-directive (via kratos msg 1782433470070): homeowner picks an exact
-- date+time for the rep visit; admin/admin_employee ACCEPTS the date or
-- RESCHEDULES with a note. Replaces — ADDITIVELY, back-compat preserved —
-- the weekday_morning/afternoon/evening bucket model that ships in mig 101.
--
-- COLUMNS:
--   requested_visit_at  timestamptz NULL  — the single ISO datetime the
--                                            homeowner picked at intake.
--                                            NULLABLE so legacy rows (which
--                                            only have requested_visit_times
--                                            JSONB) don't violate.
--   appointment_status  text NOT NULL DEFAULT 'proposed'
--                       CHECK IN ('proposed','accepted','rescheduled')
--                       — initial state when homeowner picks: 'proposed'.
--                         admin accept: → 'accepted'.
--                         admin reschedule: → 'rescheduled' + proposed_visit_at
--                                            populated.
--   proposed_visit_at   timestamptz NULL  — admin's counter-proposal datetime
--                                            when rescheduling. Homeowner can
--                                            then accept this to flip back to
--                                            'accepted' with requested_visit_at
--                                            ← proposed_visit_at.
--   reschedule_notes    text NULL          — admin's free-text reason for the
--                                            reschedule (shown to homeowner).
--
-- BACK-COMPAT (do NOT drop bucket cols per directive):
--   requested_visit_times jsonb NOT NULL stays. Existing rows continue to
--   carry the bucket-array; new intake writes BOTH requested_visit_times
--   (with a single synthesized window matching requested_visit_at) AND
--   requested_visit_at. Reps can still read requested_visit_times for the
--   bucket-display path until the FE is fully cut over.
--
-- COMPLIANCE:
--   Strictly additive: ADD COLUMN IF NOT EXISTS, no backfill scan beyond
--   instant default on appointment_status (PG 11+ stores default in catalog),
--   reversible via DROP COLUMN IF EXISTS / DROP CONSTRAINT IF EXISTS.
--   RLS policies (rep_requests_admin_update, rep_requests_homeowner_*) are
--   table-scoped via EXISTS(profiles WHERE id=auth.uid()) — no column-list
--   on USING/WITH CHECK, so the new columns inherit existing access uniformly.
--   admin===admin_employee parity preserved (rep_requests_admin_update.using
--   = profiles.role = ANY(ARRAY['admin','admin_employee'])).

BEGIN;

ALTER TABLE public.rep_requests
  ADD COLUMN IF NOT EXISTS requested_visit_at  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS appointment_status  text        NOT NULL DEFAULT 'proposed',
  ADD COLUMN IF NOT EXISTS proposed_visit_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reschedule_notes    text        NULL;

-- CHECK constraint guard on appointment_status values.
-- Adding the CONSTRAINT in a separate statement so IF NOT EXISTS works
-- on the constraint itself (ALTER ADD COLUMN IF NOT EXISTS doesn't accept
-- inline CHECK + IF NOT EXISTS combined).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'rep_requests_appointment_status_chk'
       AND conrelid = 'public.rep_requests'::regclass
  ) THEN
    ALTER TABLE public.rep_requests
      ADD CONSTRAINT rep_requests_appointment_status_chk
      CHECK (appointment_status IN ('proposed', 'accepted', 'rescheduled'));
  END IF;
END $$;

COMMIT;
