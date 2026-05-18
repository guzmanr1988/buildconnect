-- Add public.feature_flags to the supabase_realtime publication so the
-- DB-driven useFeatureFlag hook can subscribe to live UPDATE events.
--
-- Why: Phase 2 homeowner-card flag-source migration rips VITE_FINANCING_ENABLED
-- (bundle-bake, requires redeploy to flip) in favor of useFeatureFlag('financing_enabled')
-- (DB-runtime, flips at admin-toggle time without rebuild). The hook needs realtime
-- to propagate admin toggles to live sessions; without publication membership the
-- Realtime channel subscribes silently and never delivers payloads.
--
-- Idempotent via the table-existence + membership check: re-running this migration
-- is a no-op if feature_flags is already in supabase_realtime.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'feature_flags'
  ) then
    alter publication supabase_realtime add table public.feature_flags;
  end if;
end $$;
