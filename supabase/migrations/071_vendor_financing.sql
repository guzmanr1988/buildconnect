-- 071_vendor_financing.sql
-- Vendor Financing surface: per-vendor lender activation join.
--
-- Rod-direct 2026-06-15 00:35 EDT (via kratos msg 1781498642429-kratos-ujp5v
-- override of morning hold): "i want it done now". Build the vendor side of
-- the admin Financing surface (mig 047 + 048 + 049 + 050 + 056 + 057 +
-- 058 + 059) so vendors can pick which admin-active lenders THEY apply
-- through.
--
-- Scope (Rod verbatim):
--   (1) Vendor Settings master ON/OFF toggle for Financing.
--   (2) New 'Financing' TAB listing admin-maintained lenders (click-to-apply).
--   (3) Vendor activate/deactivate EACH individual lender.
--
-- THREE-AXIS GATING (composes existing admin + adds vendor layer):
--   1. feature_flags.financing_enabled        (admin master — global kill switch)
--   2. feature_flags.financing_category_*     (admin per-category gate)
--   3. lenders.active                          (admin per-lender gate)
--   4. vendor_settings_store.financingEnabled  (vendor master — v1 CLIENT-SIDE
--      via Zustand persist, mirrors usersTabEnabled shape. Acceptable v1
--      asymmetry: per-device, not cross-device. Fast-follow: promote to
--      profiles.financing_enabled if Rod wants authoritative-across-devices.
--      Kratos cleared this tradeoff explicitly msg 1781498887759-kratos-xcb40)
--   5. vendor_lenders.active (THIS MIGRATION — server-side, per-vendor
--      per-lender gate; what THIS vendor applies through)
--
-- A lender is "live to a homeowner buying from vendor V" iff all five gate
-- positive:
--   feature_flags.financing_enabled = true
--   AND feature_flags.financing_category_<lender.category> != false
--   AND lenders.active = true AND lenders.deleted_at IS NULL
--   AND vendor V has financingEnabled (client) — gates tab visibility only
--   AND vendor_lenders(V, L).active = true
--
-- APPLY ACTION (v1 per kratos msg 1781498832301-kratos-yz3eu):
--   - If lenders.apply_url IS NOT NULL → vendor clicks Apply → opens
--     lender.apply_url in new tab (HTTPS-only per mig 057 check constraint),
--     vendor_lenders.applied_at stamped to now() to record the intent.
--   - If lenders.apply_url IS NULL → vendor_lenders.applied_at stamped to
--     now() + toast "Recorded. Admin will follow up." No custom in-app form.
--   - lenders.apply_instructions rendered as the card subtitle copy either way.
--
-- INVARIANTS:
--   (1) Additive only. Zero ALTER on lenders / feature_flags / profiles /
--       any other existing table. Drop-safe per BC convention
--       (_deleted_pre_launch_YYYY_MM_DD suffix-rename if reverted).
--   (2) FK direction one-way: vendor_lenders -> profiles + lenders. Never the
--       other direction. Preserves drop-safe rollback.
--   (3) RLS per banked feedback_widen_reads_narrow_writes:
--         - vendor reads + writes OWN rows (auth.uid() = vendor_id)
--         - admin reads ALL rows (for "which vendors are applied through which
--           lenders" admin reporting in a future PR)
--         - service_role full
--   (4) Composite PK on (vendor_id, lender_id) — one row per pair, no
--       duplicates. updated_at via shared set_updated_at_secure() trigger
--       fn (already created in mig 048; security definer + search_path = public).
--   (5) applied_at NULLABLE: distinguishes "vendor activated but never clicked
--       Apply" from "vendor clicked Apply at <timestamp>". Stamped on first
--       Apply click; preserved on subsequent (latest-only via UPDATE; admin
--       can query for last-applied audit).
--   (6) ON DELETE CASCADE on vendor_id (vendor account deletion sweeps their
--       lender prefs) + ON DELETE CASCADE on lender_id (admin hard-deleting
--       a lender — rare; soft-delete via deleted_at is the normal path).

create table if not exists public.vendor_lenders (
  vendor_id   uuid not null references public.profiles(id) on delete cascade,
  lender_id   uuid not null references public.lenders(id)  on delete cascade,
  active      boolean not null default true,
  applied_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (vendor_id, lender_id)
);

create index if not exists vendor_lenders_vendor_active
  on public.vendor_lenders (vendor_id)
  where active = true;

create index if not exists vendor_lenders_lender
  on public.vendor_lenders (lender_id);

alter table public.vendor_lenders enable row level security;

-- Vendor reads own rows only.
drop policy if exists vendor_lenders_select_own on public.vendor_lenders;
create policy vendor_lenders_select_own on public.vendor_lenders
  for select using (auth.uid() = vendor_id);

-- Admin reads all (for vendor-lender reporting in future admin surface).
drop policy if exists vendor_lenders_select_admin on public.vendor_lenders;
create policy vendor_lenders_select_admin on public.vendor_lenders
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Vendor inserts own rows (with check enforces vendor cannot insert for another vendor).
drop policy if exists vendor_lenders_insert_own on public.vendor_lenders;
create policy vendor_lenders_insert_own on public.vendor_lenders
  for insert with check (auth.uid() = vendor_id);

-- Vendor updates own rows only (toggling active + stamping applied_at).
drop policy if exists vendor_lenders_update_own on public.vendor_lenders;
create policy vendor_lenders_update_own on public.vendor_lenders
  for update using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id);

-- Vendor deletes own rows (for completeness; UI uses active=false rather
-- than DELETE for soft state).
drop policy if exists vendor_lenders_delete_own on public.vendor_lenders;
create policy vendor_lenders_delete_own on public.vendor_lenders
  for delete using (auth.uid() = vendor_id);

-- updated_at trigger: reuse the shared set_updated_at_secure() fn from mig 048
-- (security definer + search_path = public per BC hardening rule). Zero new
-- function — just attach the existing trigger.
drop trigger if exists vendor_lenders_set_updated_at on public.vendor_lenders;
create trigger vendor_lenders_set_updated_at
  before update on public.vendor_lenders
  for each row execute function public.set_updated_at_secure();
