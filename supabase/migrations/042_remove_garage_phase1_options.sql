-- BuildConnect 2026 — paired DB sweep for Remodel (service_id=garage) catalog trim.
--
-- Per Rod direct 2026-05-13: the Remodel wizard (formerly garage / Interior
-- Remodel) is being narrowed pre-launch. Bundle catalog drops in PR #231:
--   * scope: recessed_lighting, flooring, paint, builtins
--   * finish_level: entire option group (standard, premium, custom)
--   * addons: closet_system, accent_wall, smart_lighting, skylight
--
-- Required because hermes DB-probe confirmed 11 vendor_option_prices rows
-- exist for the apex-demo vendor (Carlos Mendez) at price_cents=10000 each.
-- Without paired DELETE, unionBundledFillingGaps would silently re-leak the
-- removed options on vendor reads (per
-- feedback_catalog_supabase_union_bundle_masks_bundle_ship). n=N in the
-- bundle-edit-needs-server-data-update class (sibling of migration 032 +
-- catalog_removal_needs_paired_db_sweep).
--
-- Natural-key DELETEs joining options ↔ option_groups so the migration is
-- idempotent across environments where the live DB rows may or may not exist
-- (e.g. fresh staging vs. apex-demo prod).
--
-- Order: vendor_option_prices → options → option_groups (FK leaf-first;
-- options→option_groups has ON DELETE CASCADE per migration 032 comment, but
-- vendor_option_prices→options cascade is not guaranteed so explicit delete).

-- 1. Drop vendor pricing rows on the removed option IDs.
delete from vendor_option_prices
where option_id in (
  select o.id
  from options o
  join option_groups og on og.id = o.option_group_id
  where og.service_id = 'garage'
    and (
      (og.group_id = 'scope'  and o.option_id in ('recessed_lighting', 'flooring', 'paint', 'builtins'))
      or (og.group_id = 'addons' and o.option_id in ('closet_system', 'accent_wall', 'smart_lighting', 'skylight'))
      or og.group_id = 'finish'
    )
);

-- 2. Drop the options themselves.
delete from options
where id in (
  select o.id
  from options o
  join option_groups og on og.id = o.option_group_id
  where og.service_id = 'garage'
    and (
      (og.group_id = 'scope'  and o.option_id in ('recessed_lighting', 'flooring', 'paint', 'builtins'))
      or (og.group_id = 'addons' and o.option_id in ('closet_system', 'accent_wall', 'smart_lighting', 'skylight'))
      or og.group_id = 'finish'
    )
);

-- 3. Drop the now-empty finish option_group.
--    scope + addons groups stay since other garage options still live there.
delete from option_groups
where service_id = 'garage' and group_id = 'finish';
