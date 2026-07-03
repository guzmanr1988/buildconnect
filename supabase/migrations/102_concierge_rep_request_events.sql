-- 102_concierge_rep_request_events.sql
-- BuildConnect Concierge — append-only event log for rep_requests.
-- Companion to migration 101 (rep_requests core table).
--
-- DESIGN SOURCES (locked):
--   kratos Q5: activity-trail goes in a separate append-only table, NOT a
--     JSONB column on rep_requests.
--   athena spec v1 §8.3 + D5 hybrid reconcile (msg 1782350658943): table
--     named rep_request_events; 16-event enum kept for type safety; nullable
--     from_status / to_status / actor_role columns added for structured
--     status-transition audit forensics.
--
-- Mirrors the framework APPEND-only ledger discipline used across the fleet
-- for seal_ledger, datapoints.jsonl, etc.
--
-- WHY APPEND-ONLY:
--   - Immutability invariant: a state-transition event, once written, is
--     audit evidence and must not be mutated. Disputes / refund forensics /
--     cancellation reason audits all depend on the row at the time it was
--     written, not its current value.
--   - Separation of concerns: rep_requests carries CURRENT state (queryable
--     for dashboards / RLS), rep_request_events carries the HISTORY (full
--     transition log + actor + reason + payload diff).
--   - Refund forensics: when a Cancelled-with-refund row is queried, the
--     events table provides the verbatim transition history (who scheduled,
--     who visited, when project_ready fired, when cancelled fired, by whom,
--     why) without re-deriving from updated_at scattered across columns.
--   - Per-event actor-role SNAPSHOT: actor's profiles.role is captured AT
--     EVENT TIME because role can change over time (admin demoted to read-only,
--     rep promoted to admin); audit needs the role at the moment of action,
--     not the current role on the joined profile.
--
-- EVENT TYPES (controlled vocabulary via enum):
--   created            — rep_request row INSERTed (status=pending_payment)
--   charge_attempted   — Stripe Charge API call fired (before webhook ack)
--   charge_succeeded   — charge.succeeded webhook; state flipped to new
--   charge_failed      — charge.failed webhook; state flipped to charge_failed
--   assigned           — admin set assigned_rep_id
--   scheduled          — rep/admin set visit time; state new→scheduled
--   visited            — rep logged visit complete; state scheduled→visited
--   project_drafted    — rep created/linked projects row (project_id backfill)
--   project_ready     — rep finalized; state visited→project_ready
--   contractor_selected — homeowner picked contractor; state project_ready→contractor_selected
--   cancelled          — ANY non-terminal → cancelled
--   refund_issued      — Stripe refund POSTed (before webhook ack)
--   refund_succeeded   — charge.refunded webhook; charge_status→refunded
--   refund_failed      — charge.refund.failed webhook; charge_status stays refund_pending
--   note_added         — rep/admin added a free-text note (not a state change)
--   photo_uploaded     — homeowner/rep added a photo to rep_request_photos

BEGIN;

CREATE TYPE rep_request_event_type AS ENUM (
  'created',
  'charge_attempted',
  'charge_succeeded',
  'charge_failed',
  'assigned',
  'scheduled',
  'visited',
  'project_drafted',
  'project_ready',
  'contractor_selected',
  'cancelled',
  'refund_issued',
  'refund_succeeded',
  'refund_failed',
  'note_added',
  'photo_uploaded'
);

CREATE TABLE rep_request_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_request_id uuid NOT NULL REFERENCES rep_requests(id) ON DELETE CASCADE,

  -- Who fired this event. NULL for system events (webhook-triggered transitions
  -- where the actor is Stripe, not a profiles row).
  actor_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,

  -- Actor's profiles.role snapshot at event time. NULL when actor_id is NULL
  -- (system / webhook events). Captured here because role can change post-event
  -- (admin demoted, rep promoted) and the audit needs role-at-time-of-action.
  actor_role  user_role,

  event_type  rep_request_event_type NOT NULL,

  -- Structured status-transition fields (NULL for non-transition events like
  -- note_added / photo_uploaded / assigned / charge_attempted). Decouples the
  -- common "what state did we move from/to?" audit query from the free-form
  -- payload jsonb shape.
  from_status rep_request_status,
  to_status   rep_request_status,

  -- Free-form event-specific payload. Forensic capture, not source of truth.
  -- Example shapes:
  --   created: { homeowner_id, created_by, address.zip }
  --   charge_attempted: { stripe_payment_intent_id, idempotency_key, amount_cents }
  --   refund_issued: { stripe_refund_id, refund_amount_cents: 20000, retained_cents: 5000 }
  --   cancelled: { cancellation_reason, cancelled_by }  -- from/to_status carry the transition
  --   photo_uploaded: { rep_request_photo_id, storage_path }
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Free-text note (used for note_added events; otherwise NULL)
  note        text,

  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes (lookup by rep_request, by event-type for analytics, by actor for
-- per-rep activity feed)
CREATE INDEX rep_request_events_rep_request_idx
  ON rep_request_events (rep_request_id, created_at DESC);

CREATE INDEX rep_request_events_event_type_idx
  ON rep_request_events (event_type, created_at DESC);

CREATE INDEX rep_request_events_actor_idx
  ON rep_request_events (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- APPEND-ONLY enforcement: deny UPDATE + DELETE at the trigger layer (RLS
-- denial alone isn't sufficient because service-role bypasses RLS; trigger
-- denies even service-role mutations to preserve audit invariant).
CREATE OR REPLACE FUNCTION rep_request_events_deny_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rep_request_events is append-only; UPDATE/DELETE not permitted (audit invariant)';
END;
$$;

CREATE TRIGGER rep_request_events_deny_update_trg
  BEFORE UPDATE ON rep_request_events
  FOR EACH ROW
  EXECUTE FUNCTION rep_request_events_deny_mutation();

CREATE TRIGGER rep_request_events_deny_delete_trg
  BEFORE DELETE ON rep_request_events
  FOR EACH ROW
  EXECUTE FUNCTION rep_request_events_deny_mutation();

-- RLS: read-only client surface. Writes happen exclusively via edge functions
-- running with service-role (the create-rep-request / cancel-rep-request /
-- stripe-webhook fns all INSERT event rows alongside their state changes).
ALTER TABLE rep_request_events ENABLE ROW LEVEL SECURITY;

-- Homeowner: read own request's event trail
CREATE POLICY rep_request_events_homeowner_read
  ON rep_request_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rep_requests r
      WHERE r.id = rep_request_events.rep_request_id
        AND r.homeowner_id = auth.uid()
    )
  );

-- Rep: read events for own assigned requests
CREATE POLICY rep_request_events_rep_read_assigned
  ON rep_request_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rep_requests r
      WHERE r.id = rep_request_events.rep_request_id
        AND r.assigned_rep_id = auth.uid()
    )
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'rep')
  );

-- Admin / admin_employee: read all events
CREATE POLICY rep_request_events_admin_read
  ON rep_request_events FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'admin_employee')
  ));

-- No INSERT policy = client cannot directly INSERT. All writes go through
-- service-role edge functions (chokepoint pattern, same as rep_requests
-- on-behalf path).

COMMIT;
