-- 063_add_input_type_to_options.sql
-- Add input_type column to options and sub_options so the catalog can flag
-- per-option input shape: 'tile-select' (default chip/tile rendering) vs
-- 'number-input' (empty number Input writing to selectionQuantities;
-- pricing line = quantity × basePrice). Mirrors the existing
-- install_windows / install_doors / install_storm_front mechanism that
-- currently lives only in the static FE OPTION_METADATA map — this DDL
-- moves the flag into per-option DB data so vendors / admins can flip an
-- option to number-input mode without a code change.
--
-- columns:
--   options.input_type      text  NULL  — 'tile-select' | 'number-input'
--   sub_options.input_type  text  NULL  — same, for sub-option overrides
--                                         (no seed today; column is future-
--                                         compat with the same pattern)
--
-- All existing 151 options + 110 sub_options stay untouched (NULL default,
-- no data migration needed). NULL is treated as 'tile-select' by the FE
-- (mapper + getOptionMetadata overlay), so existing rows render unchanged.
--
-- RLS: existing 4 policies on options (admin INSERT/UPDATE/DELETE,
-- authenticated SELECT) cover the new column without change. Same for
-- sub_options.
--
-- Pattern: mirrors 062_add_image_urls_to_options.sql (column-add, additive,
-- nullable, reversibility-cheap). IF NOT EXISTS guard = re-runnable.
--
-- HOLD: Per kratos PR guidance, this DDL is committed to the PR but NOT
-- applied to production prior to Rod go. Apply path (post-go): Mgmt API
--   POST https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query
-- with this file's contents as the query body.

alter table public.options
  add column if not exists input_type text;

alter table public.sub_options
  add column if not exists input_type text;
