-- 106_concierge_realtime_publication.sql
-- Adds rep_requests + rep_request_events to the supabase_realtime
-- publication so FE clients can subscribe to UPDATE events on these
-- tables (e.g., the homeowner /status page watching the
-- pending_payment -> new flip after the Stripe charge.succeeded webhook).
--
-- Discovered 2026-06-25 during phaethon's homeowner happy-path walker:
-- the FE saw rows stuck at pending_payment for 30s+ even though the
-- server-side webhook handler flipped charge_status=charged in ~6s.
-- Cross-substrate forensics (Stripe /v1/events + rep_requests row state
-- + rep_request_events trail) proved server-side healthy (<1s Stripe-emit
-- to DB-flip). Root cause = rep_requests was not in the supabase_realtime
-- publication at all, so no UPDATE event was ever broadcast to the FE
-- websocket channel — perceived latency was effectively infinite, not 30s.
--
-- Idempotent — uses pg_publication_tables to skip already-included tables.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rep_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rep_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'rep_request_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rep_request_events;
  END IF;
END $$;
