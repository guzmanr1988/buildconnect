-- 062_add_image_urls_to_options.sql
-- Add image_url column to options and sub_options so the catalog can carry
-- per-option imagery. Initial driver: wall_paneling service is being
-- populated with 84 designer-panel image tiles (aydhomedecor.com inventory,
-- 11 categories) that render as IMAGE-ONLY tiles (no label text, no price
-- chip). Vendor fills names + prices later on-platform.
--
-- ROD-DIRECT 2026-06-02 (via kratos dispatch 1780430196571): "extract
-- product items WITH pictures into BC wall_paneling service config as
-- IMAGE-ONLY tiles — NO item names, NO prices."
--
-- columns:
--   options.image_url      text  NULL  — relative path under /catalog/...
--   sub_options.image_url  text  NULL  — same, for sub-option image tiles
--                                        (none seeded today; column is
--                                        future-compat with the same pattern)
--
-- All existing 151 options + 110 sub_options stay untouched (NULL default,
-- no data migration needed). FE renders image-tile mode only when the field
-- is set; tile-with-icon mode is unchanged for the other 12 services.
--
-- RLS: existing 4 policies on options (admin INSERT/UPDATE/DELETE,
-- authenticated SELECT) cover the new column without change. Same for
-- sub_options.
--
-- Pattern: mirrors 060_sub_groups_description.sql (column-add, additive,
-- reversibility-cheap). Triggers fire on column-diff so persistance bumps
-- updated_at. No audit-log trigger registered on options/sub_options today.

alter table public.options
  add column if not exists image_url text;

alter table public.sub_options
  add column if not exists image_url text;
