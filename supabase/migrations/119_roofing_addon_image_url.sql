-- 119_roofing_addon_image_url.sql
-- Populate options.image_url for all 8 roofing / addons options. Prod hydrates
-- the catalog from Supabase; src/lib/constants.ts is bundled-fallback-only,
-- which is why PR #593 (merged 44b41cb, 2026-09-01T17:08:18Z) set image_url
-- in constants.ts and yet zero add-on tiles rendered a photo on prod.
--
-- 8 rows updated (option_id -> options.id -> asset path):
--   gutters       114d5064-8857-4485-86cb-987d737a492c  /catalog/roofing/addons/gutters.jpg
--   insulation    d3174b0c-2c67-4c14-b724-e80f0edb9a7f  /catalog/roofing/addons/insulation.jpg
--   solar_prep    0c9ea4ed-0a6d-4efa-b5fa-24c74e0cafab  /catalog/roofing/addons/solar_prep.jpg
--   soffit_wood   d8022d65-2a1b-4ce5-a23d-52b2f2d4c485  /catalog/roofing/addons/soffit_wood.jpg
--   fascia_wood   4f042c72-e855-4d46-955f-3e28752af9a3  /catalog/roofing/addons/fascia_wood.jpg
--   extra_plywood 2cf5c778-403d-48f8-8517-82020589f1c3  /catalog/roofing/addons/extra_plywood.jpg
--   soffit_metal  8123b661-40a1-4fef-9962-107a8d9a45e7  /catalog/roofing/addons/soffit_metal.jpg
--   fascia_metal  c3a7bb8b-c241-483c-bd02-52556f392677  /catalog/roofing/addons/fascia_metal.jpg
--
-- Two-rail evidence of the gap (pre-migration, on prod project llybxugitrbgybplgpsi):
--   * DB read: roofing/material 5/5 image_url populated (in-column positive
--     control); roofing/addons 8/8 image_url NULL.
--   * FE read (apollo walk_task_168_530.cjs on buildc.net): 5 material <img>
--     elements resolve /catalog/roofing/materials/*.jpg; 0 add-on <img>
--     elements. Render path is proven by the positive control; the NULL is
--     a real data gap, not a schema quirk.
--
-- Assets: all 8 files present + tracked in public/catalog/roofing/addons/.
-- PR #593 shipped 7 of them (gutters, insulation, solar_prep, soffit_wood,
-- fascia_wood, soffit_metal, fascia_metal). extra_plywood.jpg was iris-
-- delivered later (agents/iris/artifacts/roofing-addon-photos/, 489967 bytes,
-- sha256 bcbbfcf2efd0dfac57ec21f52508638dbe9c9e65fd3eff536571759b90165185)
-- and is copied into public/ + tracked in the same PR as this migration so
-- the row never points at a 404.
--
-- Migration number 119: verified free across all branches at author time via
--   git log --all --diff-filter=A --name-only --pretty=format: \
--     -- 'supabase/migrations/119*'
-- (0 hits). 117 and 118 exist on unmerged branches (117 kitchen add-ons
-- optional; 118 delete empty cabinet sub_groups). Working-tree directory
-- listing tops out at 116; the number namespace is repo-wide.
--
-- Provenance / discipline:
--   * Dispatched by kratos msg 1788290884785 (2026-09-01), task of record
--     task_1788289905123_683 (in_progress under kratos, priority high,
--     apollo filer-of-record). "You author, apollo verifies."
--   * Positive control (5 roofing/material rows) is a natural free control
--     inside the same table + column + service; the post-verify assertion
--     confirms they are untouched (byte-identical count + non-null count).
--   * Reversal is clean: prior image_url is NULL on all 8; the down path is
--     setting these 8 options.id back to NULL. Documented in the row list
--     above and enforceable by a symmetric 119_down script if required.
--
-- Post-verify assertion contract (matches 118 style, ABORTS on deviation):
--   (a) exactly 8 rows updated on the UPDATE ... WHERE id = any(...);
--   (b) 0 roofing/addons options remain with image_url NULL after apply;
--   (c) 5 roofing/material options still have image_url NOT NULL, and the
--       set of their image_url values is unchanged (byte-identical against
--       a pre-migration snapshot captured inside the same transaction).
-- Any deviation raises exception; the transaction rolls back.
--
-- Idempotency: the UPDATE is anchored on the 8 UUIDs above with the exact
-- target values, so re-apply hits the same 8 rows with the same SETs
-- (get_diagnostics row_count still 8, no drift). The pre-verify guard
-- catches state drift (rows renamed, deleted, or already partially populated
-- with a different value) BEFORE the UPDATE runs.
--
-- Out of scope, do NOT touch here:
--   * src/lib/constants.ts (fallback layer). Changing both at once makes it
--     impossible to attribute what fixed the render.
--   * task_1788282114057_168 metal boundId swap. FE render-time lookup that
--     ships in the same PR as this migration (see PR description); this
--     file does not touch FE code.

begin;

do $$
declare
  addon_ids constant uuid[] := array[
    '114d5064-8857-4485-86cb-987d737a492c'::uuid,  -- gutters
    'd3174b0c-2c67-4c14-b724-e80f0edb9a7f'::uuid,  -- insulation
    '0c9ea4ed-0a6d-4efa-b5fa-24c74e0cafab'::uuid,  -- solar_prep
    'd8022d65-2a1b-4ce5-a23d-52b2f2d4c485'::uuid,  -- soffit_wood
    '4f042c72-e855-4d46-955f-3e28752af9a3'::uuid,  -- fascia_wood
    '2cf5c778-403d-48f8-8517-82020589f1c3'::uuid,  -- extra_plywood
    '8123b661-40a1-4fef-9962-107a8d9a45e7'::uuid,  -- soffit_metal
    'c3a7bb8b-c241-483c-bd02-52556f392677'::uuid   -- fascia_metal
  ];
  pre_addon_target_count int;
  pre_addon_null_count int;
  pre_material_populated_count int;
  pre_material_url_signature text;
  updated_count int;
  post_addon_null_count int;
  post_material_populated_count int;
  post_material_url_signature text;
begin
  -- Pre-verify: all 8 target rows exist and are currently NULL. Aborts if
  -- state drifted between kratos + apollo two-rail probe (17:0xZ) and apply.
  select count(*)
  into pre_addon_target_count
  from public.options o
  join public.option_groups og on og.id = o.option_group_id
  where o.id = any(addon_ids)
    and og.service_id = 'roofing'
    and og.group_id  = 'addons';
  if pre_addon_target_count <> 8 then
    raise exception
      'Migration 119 pre-check failed: expected 8 target roofing/addons rows by id, found % (state drifted since kratos+apollo probe — investigate before re-applying)',
      pre_addon_target_count;
  end if;

  select count(*)
  into pre_addon_null_count
  from public.options
  where id = any(addon_ids)
    and image_url is null;
  if pre_addon_null_count <> 8 then
    raise exception
      'Migration 119 pre-check failed: expected 8/8 target rows with image_url NULL, found % (someone else populated a row — abort so we do not overwrite)',
      pre_addon_null_count;
  end if;

  -- Positive-control snapshot (5 roofing/material rows, must remain
  -- untouched byte-identical). Captured inside the transaction so a
  -- concurrent write anywhere would surface as a post-verify mismatch.
  select count(*), string_agg(image_url, '|' order by option_id)
  into pre_material_populated_count, pre_material_url_signature
  from public.options o
  join public.option_groups og on og.id = o.option_group_id
  where og.service_id = 'roofing'
    and og.group_id  = 'material'
    and image_url is not null;
  if pre_material_populated_count <> 5 then
    raise exception
      'Migration 119 pre-check failed: expected 5 roofing/material rows with image_url populated (positive control), found %',
      pre_material_populated_count;
  end if;

  -- === UPDATE the 8 addon rows ===
  update public.options
     set image_url = case id
       when '114d5064-8857-4485-86cb-987d737a492c'::uuid then '/catalog/roofing/addons/gutters.jpg'
       when 'd3174b0c-2c67-4c14-b724-e80f0edb9a7f'::uuid then '/catalog/roofing/addons/insulation.jpg'
       when '0c9ea4ed-0a6d-4efa-b5fa-24c74e0cafab'::uuid then '/catalog/roofing/addons/solar_prep.jpg'
       when 'd8022d65-2a1b-4ce5-a23d-52b2f2d4c485'::uuid then '/catalog/roofing/addons/soffit_wood.jpg'
       when '4f042c72-e855-4d46-955f-3e28752af9a3'::uuid then '/catalog/roofing/addons/fascia_wood.jpg'
       when '2cf5c778-403d-48f8-8517-82020589f1c3'::uuid then '/catalog/roofing/addons/extra_plywood.jpg'
       when '8123b661-40a1-4fef-9962-107a8d9a45e7'::uuid then '/catalog/roofing/addons/soffit_metal.jpg'
       when 'c3a7bb8b-c241-483c-bd02-52556f392677'::uuid then '/catalog/roofing/addons/fascia_metal.jpg'
     end
   where id = any(addon_ids);
  get diagnostics updated_count = row_count;
  if updated_count <> 8 then
    raise exception
      'Migration 119 aborted: expected UPDATE 8 rows, got %',
      updated_count;
  end if;

  -- Post-verify (a) target rows: 0 NULL remaining.
  select count(*)
  into post_addon_null_count
  from public.options
  where id = any(addon_ids)
    and image_url is null;
  if post_addon_null_count <> 0 then
    raise exception
      'Migration 119 post-check failed: expected 0 target rows with image_url NULL after UPDATE, found %',
      post_addon_null_count;
  end if;

  -- Post-verify (b) positive control: 5/5 material rows still populated
  -- and the ordered signature of their image_url values is byte-identical.
  select count(*), string_agg(image_url, '|' order by option_id)
  into post_material_populated_count, post_material_url_signature
  from public.options o
  join public.option_groups og on og.id = o.option_group_id
  where og.service_id = 'roofing'
    and og.group_id  = 'material'
    and image_url is not null;
  if post_material_populated_count <> 5 then
    raise exception
      'Migration 119 post-check failed: expected 5 roofing/material rows with image_url populated, found % (positive control moved)',
      post_material_populated_count;
  end if;
  if post_material_url_signature is distinct from pre_material_url_signature then
    raise exception
      'Migration 119 post-check failed: roofing/material image_url signature changed during migration (pre=% post=%) — positive control was touched, abort',
      pre_material_url_signature, post_material_url_signature;
  end if;

  raise notice
    'Migration 119 applied: updated % roofing/addons rows; addon_null_after=% material_populated_after=% material_signature_unchanged=%',
    updated_count,
    post_addon_null_count,
    post_material_populated_count,
    (post_material_url_signature is not distinct from pre_material_url_signature);
end;
$$;

commit;
