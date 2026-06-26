-- 105_concierge_rep_request_transitions.sql
-- Status-transition-graph guard for rep_requests. Whitelists the FULL legal
-- forward graph + cancel paths, rejects illegal jumps. Defense-in-depth
-- companion to the cancel-transition-guard already in mig 101 (which only
-- guarded the moving-INTO-cancelled edge). This trigger covers EVERY
-- BEFORE UPDATE OF status, so the whole graph is enforced server-side.
--
-- Authoritative status enum (rep_request_status, set in mig 101):
--   pending_payment    initial — homeowner created, $250 charge pending
--   new                post-charge-succeeded (webhook → from pending_payment)
--   scheduled          admin assigned a rep + set visit date
--   visited            rep marked visit complete
--   project_ready      rep ran build-project-on-behalf
--   contractor_selected homeowner picked a vendor from the project
--   cancelled          terminal — homeowner self-cancel OR admin cancel
--   charge_failed      terminal — initial $250 charge failed (webhook only)
--
-- Composes feedback_blocked_status_for_externally_gated_apply_work (sister
-- task-shape discipline) — operational rail on the DB side.

-- ── Forward-transition whitelist ───────────────────────────────────
--
-- Adjacency map (prev → allowed next set):
--   pending_payment → new, charge_failed, cancelled
--                     (charge.succeeded / charge.failed webhook OR admin cancel)
--   new             → scheduled, cancelled
--                     (admin assigns rep+date / cancel)
--   scheduled       → visited, cancelled
--                     (rep marks visited / cancel)
--   visited         → project_ready, cancelled
--                     (build-project-on-behalf marks ready / cancel)
--   project_ready   → contractor_selected, cancelled
--                     (homeowner picks vendor / cancel)
--   contractor_selected → cancelled
--                     (admin-only cancel — homeowner self-cancel BLOCKED
--                      post-CS per Rod uniform-$200 promise)
--   cancelled       → ∅ (terminal — no transitions allowed)
--   charge_failed   → ∅ (terminal — no transitions allowed)

CREATE OR REPLACE FUNCTION rep_requests_status_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  legal boolean := false;
BEGIN
  -- Same-status updates are not a transition; let them through (touches like
  -- assessment_notes UPDATE re-write the row but keep status the same).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Whitelist legal forward + cancel transitions.
  legal := CASE OLD.status
    WHEN 'pending_payment'     THEN NEW.status IN ('new', 'charge_failed', 'cancelled')
    WHEN 'new'                 THEN NEW.status IN ('scheduled', 'cancelled')
    WHEN 'scheduled'           THEN NEW.status IN ('visited', 'cancelled')
    WHEN 'visited'             THEN NEW.status IN ('project_ready', 'cancelled')
    WHEN 'project_ready'       THEN NEW.status IN ('contractor_selected', 'cancelled')
    WHEN 'contractor_selected' THEN NEW.status IN ('cancelled')
    WHEN 'cancelled'           THEN false
    WHEN 'charge_failed'       THEN false
    ELSE false
  END;

  IF NOT legal THEN
    RAISE EXCEPTION 'illegal rep_requests status transition: % → % (rep_request_id=%)',
      OLD.status, NEW.status, OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rep_requests_status_transition_guard_trg
  BEFORE UPDATE OF status ON rep_requests
  FOR EACH ROW
  EXECUTE FUNCTION rep_requests_status_transition_guard();

-- ── Per-transition role-RLS UPDATE policies ────────────────────────
--
-- Admin / admin_employee: ALREADY covered by rep_requests_admin_update
-- policy in mig 101 (USING role IN ('admin','admin_employee')) — admin can
-- move any status edge that the trigger allows. No new policy needed.
--
-- Rep: ALREADY covered by rep_requests_rep_update_assigned policy in mig 101
-- (USING assigned_rep_id = auth.uid()) — rep can update their assigned row
-- and the trigger restricts which transitions are legal (scheduled→visited,
-- visited→project_ready). No new policy needed.
--
-- Homeowner: ALREADY covered by rep_requests_homeowner_cancel policy in
-- mig 101 (homeowner cancels own request to status=cancelled at status IN
-- new/scheduled/visited/project_ready). No new policy needed.
--
-- This trigger plus the mig 101 RLS forms the full defense:
--   - RLS gates "who can update this row" (role × ownership)
--   - This trigger gates "what status edges are legal" (graph whitelist)
--   - The pre-existing cancel-transition-guard in mig 101 redundantly
--     enforces the cancel-edge whitelist (defense-in-depth — both must
--     agree, so the graph is consistent if either trigger is dropped).

-- ── Backfill safety: ensure no rows already violate the graph ─────
--
-- This dev project is fresh — zero rows exist. No backfill needed. If
-- this mig is applied to a project with existing rep_request rows, it
-- ONLY enforces on UPDATEs going forward; existing rows are untouched
-- by definition (triggers fire on INSERT/UPDATE/DELETE, not on already-
-- present rows). So no backfill validation step is required.

COMMENT ON FUNCTION rep_requests_status_transition_guard() IS
  'Whitelist of legal rep_requests.status transitions. Mirrors cancel-transition-guard from mig 101 for the full graph. Composes with the per-role RLS policies on rep_requests (admin / admin_employee any-edge, rep assigned-row, homeowner own-row cancel) — RLS gates row-write authority, this trigger gates the status edge.';
