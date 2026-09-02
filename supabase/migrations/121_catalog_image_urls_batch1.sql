-- 121_catalog_image_urls_batch1.sql
-- Populate options.image_url for 72 options across 9 services:
--   air_conditioning (8), blinds (10), driveways (7), fencing (7),
--   house_painting (3), kitchen (6), pergolas (3), pool (10),
--   garage/remodel (13), roofing/repair_materials (5).
--
-- Source: 66 files committed to public/catalog/<service>/ in the same PR.
--   73 originally staged by iris
--   -2 proxy rejects (laminar_jet, spa — wrong product per kratos 2026-09-02)
--   -5 losing candidates (one of each: purifier, thermostat, single, granite,
--      cement_floor pairs — pick 1 of 2 candidates)
--   -1 unmapped (quartz staged file has no matching DB option)
--   = 66 files shipped
-- Files → rows discrepancy (67 rows from 66 files):
--   kitchen/cabinet.jpg maps to both "Cabinet Install" and "Cabinet Installation"
-- Plus 5 roofing/repair_materials rows that reuse existing
--   /catalog/roofing/materials/*.jpg URLs (no new files).
--
-- Count prediction (verify post-apply against prod llybxugitrbgybplgpsi):
--   Pre-apply:  252 total / 97 with image_url / 155 null
--   Post-apply: 252 total / 169 with image_url / 83 null
--
-- Gaps (still null after this migration, will need separate work):
--   blinds: roman, cellular, motorized, fabric, light_control group, mount group
--   fencing: privacy_slats
--   house_painting: custom_palette, height/rooms/scope groups
--   kitchen: Stone Install, Stone Installation, Demolition, Plumbing
--   pergolas: aluminum_terrace
--   pool: beach, bubbler, heater, laminar_jet, spa (last two rejected proxies)
--   windows_doors: storm_front (flagged gap from prior session)
--   roofing: service_type/addons,repair,replace (ICON — not photographed)
--   air_conditioning: maintenance
--
-- Idempotency: all 72 rows anchored by UUID. Re-apply sets same values
--   (no drift possible; pre-verify catches any non-null state before UPDATE).
--
-- Task of record: task_1788369772031_664 (in_progress, iris)
-- Kratos ruling: 2026-09-02 (reject proxies, source gaps wider than Pexels)

begin;

do $$
declare
  -- All 72 target UUIDs
  target_ids constant uuid[] := array[
    -- air_conditioning / system (5)
    '49da4154-b8bb-4462-9b52-ad23bdb34e15'::uuid,  -- central_2
    '5accd660-983b-4738-a81c-cb3afd0b50c5'::uuid,  -- central_3
    '94b7ca51-c188-4bf2-9ae6-b4ad1472a1a6'::uuid,  -- central_4
    '1dc128ae-faca-4d2c-8e32-c76ed0b057ff'::uuid,  -- mini_multi
    'bd5cabb0-bbf0-406f-ac00-dbcf909881aa'::uuid,  -- mini_single
    -- air_conditioning / addons (3)
    '83b7d316-8be2-4062-91b5-69b6c2731055'::uuid,  -- ducts
    '96988d2c-65ca-4c85-87be-0e2621230ecc'::uuid,  -- purifier
    'ba1b1381-0274-4163-9831-e454a848e29a'::uuid,  -- thermostat
    -- blinds / type (5)
    'c60b430b-0bee-4ec2-b4a5-7cb6c4e1e4c9'::uuid,  -- blackout
    '6a5700f2-5531-4a4f-bb20-81342956870f'::uuid,  -- drape
    '65f62607-a118-4192-8f8f-228e8a4df251'::uuid,  -- roller
    'b71c5be6-c82b-4df8-95ba-e821ba615cbe'::uuid,  -- venetian
    '0553990e-78c1-43e7-82cf-fdccb56ea683'::uuid,  -- vertical
    -- blinds / material (5)
    'ba0adb60-da16-4077-a94a-3dca7f1b7f9e'::uuid,  -- aluminum
    'bd7273f9-2899-4563-bcb7-5697e2cd1ed1'::uuid,  -- bamboo
    'c0351c97-0d30-45da-9f52-4bddb6b9cbc6'::uuid,  -- faux_wood
    'ffbe4757-be3a-42e4-8b53-4e0bf36a20da'::uuid,  -- real_wood
    'c22dae9f-7eb0-46ed-a2eb-1f2ce345970c'::uuid,  -- vinyl
    -- driveways / addons (3)
    '5f7259a5-16c1-469a-a213-0a5326a4fa74'::uuid,  -- decorative
    'f3613afd-704e-4741-b7bb-f82e3210c30b'::uuid,  -- grass
    'a4e93a37-40d1-4878-9f66-1fcdba457f9f'::uuid,  -- sealant
    -- driveways / surface (4)
    '4e15b14d-4e24-4825-ae41-16a1f73bcddb'::uuid,  -- asphalt
    '6f161486-0902-4ce2-9088-f329dd038783'::uuid,  -- pavers
    '2acd44b0-5123-4090-b498-8ea28d5b58ec'::uuid,  -- square_concrete
    'dab60ad8-44c0-46b7-80c4-da032b027905'::uuid,  -- stamped
    -- fencing / material (5)
    '16fc5723-dbef-4f50-ac54-777451d08263'::uuid,  -- aluminum
    '8a4df315-9a07-4884-9fe1-5f1d18e09e81'::uuid,  -- chain_link
    '86426523-4cf6-4ddc-af81-65bf615e273f'::uuid,  -- vinyl
    'f6453882-e67c-4592-b63b-b6a83d5dd694'::uuid,  -- wood
    'bf990be5-4127-47e3-83fe-2dca9c2256a2'::uuid,  -- wrought_iron
    -- fencing / addons (2)
    '68470923-7ee2-4edd-bf71-c460873da135'::uuid,  -- gates
    'de80d4b1-f236-4ce7-82d0-576bc9eb98c4'::uuid,  -- post_caps
    -- house_painting / colors (3)
    '597c2447-ce24-480d-9a9f-3c292386f67f'::uuid,  -- multi_color
    'e93393af-f824-45c0-b59d-662aa899da03'::uuid,  -- single_color
    'ea77aecc-2c4d-48f8-ae89-33b261ca6aa6'::uuid,  -- two_tone
    -- kitchen / Add-ons (2)
    'c858c0b5-8e9c-4110-8f30-6b59bb42a0dd'::uuid,  -- Pot Filler
    '85db94bf-bb7d-4936-8918-41ac8f453622'::uuid,  -- Under-Cabinet Lighting
    -- kitchen / Cabinets + Installation (2 rows, 1 shared URL)
    '4419f5dd-8836-483c-b244-0169ee625301'::uuid,  -- Cabinet Install
    'b840ed07-9fea-4a75-99b8-4646a1d105f7'::uuid,  -- Cabinet Installation
    -- kitchen / Stone (2)
    '5b03c6e6-7525-4c37-81ab-c0b3974547f6'::uuid,  -- Granite
    '89a9bd3f-a36e-4c9b-a623-88b85f9657cc'::uuid,  -- Quartzite
    -- pergolas / addons (2)
    'b5e3d61d-bf7d-40fa-afcc-f1bf482a5d57'::uuid,  -- fans
    '600a1827-20e7-42e5-a731-4289a3de54c8'::uuid,  -- screen
    -- pergolas / structure (1)
    '03e598da-6e32-4a4e-92ca-b5ac53d164dd'::uuid,  -- aluminum_pergola
    -- pool / addons (3)
    '28a0674a-d0ca-4438-be9a-814863ab54ed'::uuid,  -- led
    'b19707bb-e93b-4626-b584-f1802a0e011e'::uuid,  -- pool_fence
    '2f0361e8-add6-4034-84aa-118a1dee6281'::uuid,  -- waterfall
    -- pool / pool_floor (6)
    '0be20e2a-947f-47ee-9dd3-e043c559ddf6'::uuid,  -- artificial_turf
    '19354ab4-8332-4f73-826b-25b732d4ec77'::uuid,  -- cement_floor
    'eaf5cec6-9b02-4b65-9586-831381fc7ae1'::uuid,  -- pavers
    'dc52a2a2-a5a0-4c34-a6ea-60f7ce722864'::uuid,  -- square_concrete
    'ab2f51ec-fc3d-4641-8f71-04084a54eced'::uuid,  -- stamped_concrete
    '95f5152a-f67a-4bba-b3db-570f6fc66e1c'::uuid,  -- travertine
    -- pool / water_feature_units (1)
    '4d8eea0c-6706-453b-90b6-f312830d8b51'::uuid,  -- waterfall_unit
    -- garage (remodel) / addons (2)
    'c2d85321-8a04-4a9e-a8b3-b2b055195a91'::uuid,  -- crown_molding
    '8c4dcf82-b595-4d43-a6d9-83da08a20052'::uuid,  -- popcorn_removal
    -- garage (remodel) / rooms (6)
    '6f278d0a-01f1-4329-af22-be35602d7e97'::uuid,  -- bedroom
    '6da3ba99-65f8-4738-8bbf-e772a226ab7f'::uuid,  -- dining
    'ed2ae6fb-d8e8-4d72-b02e-a5fc9d482e47'::uuid,  -- foyer_entry
    'ff119d6c-e86c-45f2-8342-7bb40fa0ceff'::uuid,  -- hallway_stairway
    '81977bdc-b869-4c18-96bb-f78af29c257e'::uuid,  -- living_family
    'dde112bb-ba3a-4aef-91ec-9a7c69086109'::uuid,  -- office_den
    -- garage (remodel) / scope (5)
    '20d265c4-911c-4066-8770-dae3490cfd58'::uuid,  -- ceiling
    '46c29298-77a8-4086-a5f5-32266d9fbd53'::uuid,  -- drywall
    '9e262e69-0162-46e2-af20-7e7448623c0d'::uuid,  -- interior_doors
    '6f376681-6e1a-4e7d-91ed-dc11fa4f12f7'::uuid,  -- move_walls
    'fdbf873d-88dd-4536-90b5-e057f4cbf120'::uuid,  -- trim_molding
    -- roofing / repair_materials (5) — reuse /catalog/roofing/materials/*.jpg
    '04233a1c-8c4a-466b-8524-02abc43574c9'::uuid,  -- repair_shingle
    'a15cf4f3-fe77-43b6-8ca8-56b0be46cba6'::uuid,  -- repair_barrel_tile
    'b09971a3-d7c3-4810-8fd2-1c16c085b95c'::uuid,  -- repair_metal
    'dd94f034-d9f1-42b4-b449-071b07ead129'::uuid,  -- repair_aluminum
    '324c99ce-5933-4fe2-9eab-fc2249b1cf9e'::uuid   -- repair_flat_roof
  ];
  pre_target_count      int;
  pre_null_count        int;
  pre_roofing_material_count int;
  updated_count         int;
  post_null_count       int;
  post_roofing_material_count int;
begin
  -- Pre-verify 1: all 72 target rows exist.
  select count(*) into pre_target_count
  from public.options
  where id = any(target_ids);
  if pre_target_count <> 72 then
    raise exception
      'Migration 121 pre-check: expected 72 target rows by id, found % (schema drifted or wrong UUIDs)',
      pre_target_count;
  end if;

  -- Pre-verify 2: all 72 are currently NULL (no prior partial apply).
  select count(*) into pre_null_count
  from public.options
  where id = any(target_ids)
    and image_url is null;
  if pre_null_count <> 72 then
    raise exception
      'Migration 121 pre-check: expected 72/72 target rows with image_url NULL, found % (already partially applied — abort to avoid overwrites)',
      pre_null_count;
  end if;

  -- Positive control: 13 existing roofing rows (5 material + 8 addons) still populated.
  select count(*) into pre_roofing_material_count
  from public.options o
  join public.option_groups og on og.id = o.option_group_id
  where og.service_id = 'roofing'
    and og.group_id in ('material', 'addons')
    and image_url is not null;
  if pre_roofing_material_count <> 13 then
    raise exception
      'Migration 121 pre-check: expected 13 roofing material+addons rows with image_url (positive control), found %',
      pre_roofing_material_count;
  end if;

  -- === UPDATE all 72 rows ===
  update public.options
     set image_url = case id
       -- air_conditioning / system
       when '49da4154-b8bb-4462-9b52-ad23bdb34e15'::uuid then '/catalog/air_conditioning/central_2.jpg'
       when '5accd660-983b-4738-a81c-cb3afd0b50c5'::uuid then '/catalog/air_conditioning/central_3.jpg'
       when '94b7ca51-c188-4bf2-9ae6-b4ad1472a1a6'::uuid then '/catalog/air_conditioning/central_4.jpg'
       when '1dc128ae-faca-4d2c-8e32-c76ed0b057ff'::uuid then '/catalog/air_conditioning/mini_multi.jpg'
       when 'bd5cabb0-bbf0-406f-ac00-dbcf909881aa'::uuid then '/catalog/air_conditioning/mini_single.jpg'
       -- air_conditioning / addons
       when '83b7d316-8be2-4062-91b5-69b6c2731055'::uuid then '/catalog/air_conditioning/ducts.jpg'
       when '96988d2c-65ca-4c85-87be-0e2621230ecc'::uuid then '/catalog/air_conditioning/purifier.jpg'
       when 'ba1b1381-0274-4163-9831-e454a848e29a'::uuid then '/catalog/air_conditioning/thermostat.jpg'
       -- blinds / type
       when 'c60b430b-0bee-4ec2-b4a5-7cb6c4e1e4c9'::uuid then '/catalog/blinds/blackout.jpg'
       when '6a5700f2-5531-4a4f-bb20-81342956870f'::uuid then '/catalog/blinds/drape.jpg'
       when '65f62607-a118-4192-8f8f-228e8a4df251'::uuid then '/catalog/blinds/roller.jpg'
       when 'b71c5be6-c82b-4df8-95ba-e821ba615cbe'::uuid then '/catalog/blinds/venetian.jpg'
       when '0553990e-78c1-43e7-82cf-fdccb56ea683'::uuid then '/catalog/blinds/vertical.jpg'
       -- blinds / material
       when 'ba0adb60-da16-4077-a94a-3dca7f1b7f9e'::uuid then '/catalog/blinds/aluminum.jpg'
       when 'bd7273f9-2899-4563-bcb7-5697e2cd1ed1'::uuid then '/catalog/blinds/bamboo.jpg'
       when 'c0351c97-0d30-45da-9f52-4bddb6b9cbc6'::uuid then '/catalog/blinds/faux_wood.jpg'
       when 'ffbe4757-be3a-42e4-8b53-4e0bf36a20da'::uuid then '/catalog/blinds/real_wood.jpg'
       when 'c22dae9f-7eb0-46ed-a2eb-1f2ce345970c'::uuid then '/catalog/blinds/vinyl.jpg'
       -- driveways / addons
       when '5f7259a5-16c1-469a-a213-0a5326a4fa74'::uuid then '/catalog/driveways/decorative.jpg'
       when 'f3613afd-704e-4741-b7bb-f82e3210c30b'::uuid then '/catalog/driveways/grass.jpg'
       when 'a4e93a37-40d1-4878-9f66-1fcdba457f9f'::uuid then '/catalog/driveways/sealant.jpg'
       -- driveways / surface
       when '4e15b14d-4e24-4825-ae41-16a1f73bcddb'::uuid then '/catalog/driveways/asphalt.jpg'
       when '6f161486-0902-4ce2-9088-f329dd038783'::uuid then '/catalog/driveways/pavers.jpg'
       when '2acd44b0-5123-4090-b498-8ea28d5b58ec'::uuid then '/catalog/driveways/square_concrete.jpg'
       when 'dab60ad8-44c0-46b7-80c4-da032b027905'::uuid then '/catalog/driveways/stamped.jpg'
       -- fencing / material
       when '16fc5723-dbef-4f50-ac54-777451d08263'::uuid then '/catalog/fencing/aluminum.jpg'
       when '8a4df315-9a07-4884-9fe1-5f1d18e09e81'::uuid then '/catalog/fencing/chain_link.jpg'
       when '86426523-4cf6-4ddc-af81-65bf615e273f'::uuid then '/catalog/fencing/vinyl.jpg'
       when 'f6453882-e67c-4592-b63b-b6a83d5dd694'::uuid then '/catalog/fencing/wood.jpg'
       when 'bf990be5-4127-47e3-83fe-2dca9c2256a2'::uuid then '/catalog/fencing/wrought_iron.jpg'
       -- fencing / addons
       when '68470923-7ee2-4edd-bf71-c460873da135'::uuid then '/catalog/fencing/gates.jpg'
       when 'de80d4b1-f236-4ce7-82d0-576bc9eb98c4'::uuid then '/catalog/fencing/post_caps.jpg'
       -- house_painting / colors
       when '597c2447-ce24-480d-9a9f-3c292386f67f'::uuid then '/catalog/house_painting/multi_color.jpg'
       when 'e93393af-f824-45c0-b59d-662aa899da03'::uuid then '/catalog/house_painting/single_color.jpg'
       when 'ea77aecc-2c4d-48f8-ae89-33b261ca6aa6'::uuid then '/catalog/house_painting/two_tone.jpg'
       -- kitchen / Add-ons
       when 'c858c0b5-8e9c-4110-8f30-6b59bb42a0dd'::uuid then '/catalog/kitchen/pot_filler.jpg'
       when '85db94bf-bb7d-4936-8918-41ac8f453622'::uuid then '/catalog/kitchen/under_cabinet_lighting.jpg'
       -- kitchen / Cabinets + Installation (shared URL)
       when '4419f5dd-8836-483c-b244-0169ee625301'::uuid then '/catalog/kitchen/cabinet.jpg'
       when 'b840ed07-9fea-4a75-99b8-4646a1d105f7'::uuid then '/catalog/kitchen/cabinet.jpg'
       -- kitchen / Stone
       when '5b03c6e6-7525-4c37-81ab-c0b3974547f6'::uuid then '/catalog/kitchen/granite.jpg'
       when '89a9bd3f-a36e-4c9b-a623-88b85f9657cc'::uuid then '/catalog/kitchen/quartzite.jpg'
       -- pergolas / addons
       when 'b5e3d61d-bf7d-40fa-afcc-f1bf482a5d57'::uuid then '/catalog/pergolas/fans.jpg'
       when '600a1827-20e7-42e5-a731-4289a3de54c8'::uuid then '/catalog/pergolas/screen.jpg'
       -- pergolas / structure
       when '03e598da-6e32-4a4e-92ca-b5ac53d164dd'::uuid then '/catalog/pergolas/aluminum_pergola.jpg'
       -- pool / addons
       when '28a0674a-d0ca-4438-be9a-814863ab54ed'::uuid then '/catalog/pool/led.jpg'
       when 'b19707bb-e93b-4626-b584-f1802a0e011e'::uuid then '/catalog/pool/pool_fence.jpg'
       when '2f0361e8-add6-4034-84aa-118a1dee6281'::uuid then '/catalog/pool/waterfall.jpg'
       -- pool / pool_floor
       when '0be20e2a-947f-47ee-9dd3-e043c559ddf6'::uuid then '/catalog/pool/artificial_turf.jpg'
       when '19354ab4-8332-4f73-826b-25b732d4ec77'::uuid then '/catalog/pool/cement_floor.jpg'
       when 'eaf5cec6-9b02-4b65-9586-831381fc7ae1'::uuid then '/catalog/pool/pavers.jpg'
       when 'dc52a2a2-a5a0-4c34-a6ea-60f7ce722864'::uuid then '/catalog/pool/square_concrete.jpg'
       when 'ab2f51ec-fc3d-4641-8f71-04084a54eced'::uuid then '/catalog/pool/stamped_concrete.jpg'
       when '95f5152a-f67a-4bba-b3db-570f6fc66e1c'::uuid then '/catalog/pool/travertine.jpg'
       -- pool / water_feature_units
       when '4d8eea0c-6706-453b-90b6-f312830d8b51'::uuid then '/catalog/pool/waterfall_unit.jpg'
       -- garage (remodel) / addons
       when 'c2d85321-8a04-4a9e-a8b3-b2b055195a91'::uuid then '/catalog/garage/crown_molding.jpg'
       when '8c4dcf82-b595-4d43-a6d9-83da08a20052'::uuid then '/catalog/garage/popcorn_removal.jpg'
       -- garage (remodel) / rooms
       when '6f278d0a-01f1-4329-af22-be35602d7e97'::uuid then '/catalog/garage/bedroom.jpg'
       when '6da3ba99-65f8-4738-8bbf-e772a226ab7f'::uuid then '/catalog/garage/dining.jpg'
       when 'ed2ae6fb-d8e8-4d72-b02e-a5fc9d482e47'::uuid then '/catalog/garage/foyer_entry.jpg'
       when 'ff119d6c-e86c-45f2-8342-7bb40fa0ceff'::uuid then '/catalog/garage/hallway_stairway.jpg'
       when '81977bdc-b869-4c18-96bb-f78af29c257e'::uuid then '/catalog/garage/living_family.jpg'
       when 'dde112bb-ba3a-4aef-91ec-9a7c69086109'::uuid then '/catalog/garage/office_den.jpg'
       -- garage (remodel) / scope
       when '20d265c4-911c-4066-8770-dae3490cfd58'::uuid then '/catalog/garage/ceiling.jpg'
       when '46c29298-77a8-4086-a5f5-32266d9fbd53'::uuid then '/catalog/garage/drywall.jpg'
       when '9e262e69-0162-46e2-af20-7e7448623c0d'::uuid then '/catalog/garage/interior_doors.jpg'
       when '6f376681-6e1a-4e7d-91ed-dc11fa4f12f7'::uuid then '/catalog/garage/move_walls.jpg'
       when 'fdbf873d-88dd-4536-90b5-e057f4cbf120'::uuid then '/catalog/garage/trim_molding.jpg'
       -- roofing / repair_materials — reuse material URLs (files already in public/)
       when '04233a1c-8c4a-466b-8524-02abc43574c9'::uuid then '/catalog/roofing/materials/shingle.jpg'
       when 'a15cf4f3-fe77-43b6-8ca8-56b0be46cba6'::uuid then '/catalog/roofing/materials/barrel_tile.jpg'
       when 'b09971a3-d7c3-4810-8fd2-1c16c085b95c'::uuid then '/catalog/roofing/materials/metal.jpg'
       when 'dd94f034-d9f1-42b4-b449-071b07ead129'::uuid then '/catalog/roofing/materials/aluminum.jpg'
       when '324c99ce-5933-4fe2-9eab-fc2249b1cf9e'::uuid then '/catalog/roofing/materials/flat_roof.jpg'
     end
   where id = any(target_ids);
  get diagnostics updated_count = row_count;
  if updated_count <> 72 then
    raise exception
      'Migration 121 aborted: expected UPDATE 72 rows, got %',
      updated_count;
  end if;

  -- Post-verify 1: none of the 72 target rows still null.
  select count(*) into post_null_count
  from public.options
  where id = any(target_ids)
    and image_url is null;
  if post_null_count <> 0 then
    raise exception
      'Migration 121 post-check: expected 0 target rows still null after UPDATE, found %',
      post_null_count;
  end if;

  -- Post-verify 2: roofing positive control rows unchanged (still 13).
  select count(*) into post_roofing_material_count
  from public.options o
  join public.option_groups og on og.id = o.option_group_id
  where og.service_id = 'roofing'
    and og.group_id in ('material', 'addons')
    and image_url is not null;
  if post_roofing_material_count <> 13 then
    raise exception
      'Migration 121 post-check: roofing material+addons control moved (expected 13, got %)',
      post_roofing_material_count;
  end if;

  raise notice
    'Migration 121 applied: updated=% target_null_after=% roofing_control_after=%',
    updated_count, post_null_count, post_roofing_material_count;
end;
$$;

commit;
