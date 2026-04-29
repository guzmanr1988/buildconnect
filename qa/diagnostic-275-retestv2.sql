-- Q1 #275 retest-v2 root-cause diagnostic SQL set.
-- Per kratos dispatch + helios analysis. Rodolfo runs in Supabase Studio
-- SQL editor; copy each block + run + screenshot/paste results back via
-- kratos. Logs-panel-first fallback if migration 014 didn't resolve the
-- silent-trigger-failure (Apollo probe-275-retest-v2 RED).
--
-- Run order: Q1 first, capture userId, paste into Q2. Q2 disambiguates
-- trigger-fired-vs-not in 5 seconds. Subsequent queries inform fix-shape
-- decision per banked feedback_revert_then_surgical at n=2 fix-attempts.

-- ===========================================================================
-- Query 1 — Most-recent apollo probe signup user
-- ===========================================================================
-- Captures the userId from the latest probe-275-retest-v2 signup attempt.
-- Pass the returned id into Query 2 below.

select id, email, created_at, raw_user_meta_data
from auth.users
where email like 'apollo-probe-275%'
order by created_at desc
limit 1;


-- ===========================================================================
-- Query 2 — KEY DISAMBIGUATOR: does profiles row exist for that userId?
-- ===========================================================================
-- Replace <userId> with the id from Query 1 result.
-- Result interpretation:
--   0 rows  → trigger handle_new_user did NOT insert. Cause = trigger errored
--             OR didn't fire. Continue to Query 3 + Logs panel.
--   1 row   → trigger DID insert. Then PATCH 406 means RLS SELECT blocks
--             return on the PATCHed row. Continue to Query 4 (RLS policies).

select id, email, role, name, initials, created_at
from public.profiles
where id = '<userId-from-query-1>';


-- ===========================================================================
-- Query 3 — handle_new_user function source + config (verifies 014 applied)
-- ===========================================================================
-- proconfig should show 'search_path=public, auth' on handle_new_user
-- post-014. If proconfig is null or shows only 'search_path=public'
-- (the original 001 setting), 014 did not actually take effect.

select proname, prosecdef, proconfig, prosrc
from pg_proc
where proname in ('handle_new_user', 'handle_commission_payment', 'handle_new_sale', 'auth_role');


-- ===========================================================================
-- Query 4 — profiles RLS policies
-- ===========================================================================
-- Verifies 'handle_new_user can insert profile' policy exists with check=true.
-- If missing, trigger INSERT could be silently blocked by RLS.

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles';


-- ===========================================================================
-- Query 5 — profiles column constraints (NOT NULL audit)
-- ===========================================================================
-- Verifies 013 NCA columns are all NULL-allowed (per 013 source). If any
-- are NOT NULL without default, handle_new_user trigger INSERT (which
-- doesn't populate them) will fail constraint check.

select column_name, is_nullable, column_default, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
order by ordinal_position;


-- ===========================================================================
-- Query 6 — trigger inventory
-- ===========================================================================
-- Verifies on_auth_user_created exists on auth.users. Surfaces any
-- additional triggers that could chain-fail or interfere.

select event_object_schema, event_object_table, trigger_name, event_manipulation, action_timing
from information_schema.triggers
where trigger_schema in ('public', 'auth')
order by event_object_table, trigger_name;


-- ===========================================================================
-- Query 7 — user_role enum values (post-015 verify; optional)
-- ===========================================================================
-- Verifies user_role enum values. Should include homeowner / vendor / admin
-- (and account_rep IF migration 015 applied successfully via ALTER TYPE).

select enumlabel
from pg_enum
where enumtypid = 'user_role'::regtype
order by enumsortorder;
