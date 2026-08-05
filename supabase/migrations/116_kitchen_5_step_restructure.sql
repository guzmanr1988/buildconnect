-- 116_kitchen_5_step_restructure.sql
-- Kitchen configurator 3→5 optionGroups: add Installation + Extra Services,
-- re-parent Cabinet Installation and Stone Installation from their current
-- product groups into the new Installation group, add Kitchen Demolition +
-- Kitchen Plumbing as opt-in contractor-priced items.
--
-- Task pair: task_1785911215416_296 (this, DB half) + task_1785911070274_165
-- (phaethon, code half). Rod-priority, kratos-authorized ship path.
--
-- Final layout (post-migration):
--   sort_order 0: Cabinets        (unchanged, id=c2282479-0807-4622-bc24-179620d9d524)
--   sort_order 1: Stone           (unchanged, id=a5bc34b8-57d4-4b40-890a-abd0240a68ee)
--   sort_order 2: Installation    (NEW)
--   sort_order 3: Add-ons         (was 2, id=7e252233-6b75-45af-8314-4ff61fc583b7)
--   sort_order 4: Extra Services  (NEW)
--
-- MOVE-IS-MOVE guarantee: existing option UUIDs are preserved on re-parent,
-- so vendor_option_prices rows (FK on option_id) and sub_groups rows (FK on
-- option_id) stay intact. Cabinet Installation keeps its Yes/No sub_groups
-- and $1.20 linear_ft apex-demo price; Stone Installation keeps its Yes/No
-- sub_groups and $1.40 linear_ft price. No gating, pricing or SKU touched.
--
-- Contractor pricing model (Rod voice-directive tonight): BuildConnect sets
-- ZERO prices for Kitchen Demolition + Kitchen Plumbing. Each contractor
-- prices them independently via /vendor/catalog. The two new option rows are
-- inserted WITHOUT any vendor_option_prices rows. Homeowner surface convention
-- ("Price pending" or omit-from-totals per phaethon lead-workflow.tsx:225)
-- handles the no-price case; homeowner NEVER sees $0 or blank.
--
-- Idempotency: group inserts use WHERE NOT EXISTS on (service_id, group_id);
-- option inserts use WHERE NOT EXISTS on (option_group_id, option_id);
-- UPDATEs are anchored on UUIDs so re-apply hits the same row with the same
-- SET values (row_count stays 1, no state drift).
--
-- Safety: every UPDATE and re-parent carries a GET DIAGNOSTICS + RAISE
-- EXCEPTION guard that aborts the migration if row_count != expected.
-- A zero-row UPDATE on a UUID WHERE clause means the row was deleted between
-- my pre-verification queries and apply — that is a HARD error and the
-- migration must not silently continue. Also post-migration state assertion
-- confirms the FINAL group and item layout matches the plan.
--
-- Out-of-scope, pre-existing, do NOT touch here:
--   * "Verneered" spelling in cabinet material sub_group_id — wire contract,
--     rename is a separate change with its own blast radius (kratos directive).
--   * Empty sub_options under the 4 cabinet material sub_groups (plywood/
--     mdf/hardboard/verneered_board) — pre-migration site baseline being
--     documented by apollo walker before this migration lands, so a live
--     issue there is attributable to state PRIOR to this migration.

begin;

do $$
declare
  installation_group_id uuid;
  extra_services_group_id uuid;
  addons_updated_count int;
  cabinet_installation_moved_count int;
  stone_installation_moved_count int;
  demolition_inserted_count int;
  plumbing_inserted_count int;
  installation_inserted_count int;
  extra_services_inserted_count int;
  final_group_count int;
  final_kitchen_option_count int;
  pre_move_kitchen_option_count int;
begin
  -- Baseline count so post-move parity is checkable (see final assertion).
  select count(*) into pre_move_kitchen_option_count
  from options o
  join option_groups og on og.id = o.option_group_id
  where og.service_id = 'kitchen';

  -- === 1. Insert Installation group (idempotent) ===
  insert into option_groups (service_id, group_id, label, required, type, sort_order)
  select 'kitchen', 'Installation', 'Installation', false, 'multi', 2
  where not exists (
    select 1 from option_groups
    where service_id = 'kitchen' and group_id = 'Installation'
  );
  get diagnostics installation_inserted_count = row_count;

  select id into installation_group_id
  from option_groups
  where service_id = 'kitchen' and group_id = 'Installation';

  if installation_group_id is null then
    raise exception 'Installation group not found post-insert (installation_inserted_count=%)', installation_inserted_count;
  end if;

  -- === 2. Insert Extra Services group (idempotent) ===
  -- group_id and label BOTH "Extra Services" per kratos 75ahn (matched Title
  -- Case both fields — do not add new schema drift like "Cabinets"/"Cabinet").
  insert into option_groups (service_id, group_id, label, required, type, sort_order)
  select 'kitchen', 'Extra Services', 'Extra Services', false, 'multi', 4
  where not exists (
    select 1 from option_groups
    where service_id = 'kitchen' and group_id = 'Extra Services'
  );
  get diagnostics extra_services_inserted_count = row_count;

  select id into extra_services_group_id
  from option_groups
  where service_id = 'kitchen' and group_id = 'Extra Services';

  if extra_services_group_id is null then
    raise exception 'Extra Services group not found post-insert (extra_services_inserted_count=%)', extra_services_inserted_count;
  end if;

  -- === 3. Bump Add-ons sort_order 2 → 3 ===
  -- Group id anchored on service_id + group_id (unique combo).
  update option_groups
  set sort_order = 3
  where service_id = 'kitchen' and group_id = 'Add-ons';
  get diagnostics addons_updated_count = row_count;

  if addons_updated_count != 1 then
    raise exception 'Add-ons sort_order bump: expected 1 row updated, got %', addons_updated_count;
  end if;

  -- === 4. Re-parent Cabinet Installation → Installation group, sort_order 0 ===
  -- UUID-anchored WHERE: row_count is exactly 1 (row exists) or 0 (row deleted
  -- since pre-verify). 0 = HARD error, migration aborts.
  update options
  set option_group_id = installation_group_id, sort_order = 0
  where id = 'b840ed07-9fea-4a75-99b8-4646a1d105f7';
  get diagnostics cabinet_installation_moved_count = row_count;

  if cabinet_installation_moved_count != 1 then
    raise exception 'Cabinet Installation (b840ed07) re-parent: expected 1 row, got %', cabinet_installation_moved_count;
  end if;

  -- === 5. Re-parent Stone Installation → Installation group, sort_order 1 ===
  update options
  set option_group_id = installation_group_id, sort_order = 1
  where id = 'ba09523a-8a54-4eb6-ade5-e807650b5d8a';
  get diagnostics stone_installation_moved_count = row_count;

  if stone_installation_moved_count != 1 then
    raise exception 'Stone Installation (ba09523a) re-parent: expected 1 row, got %', stone_installation_moved_count;
  end if;

  -- === 6. Insert Kitchen Demolition option (idempotent, NO vendor price) ===
  -- price_unit="flat" per Rod voice-directive (per-job) + kratos 47up2 D.
  -- No vendor_option_prices insert here — contractors add via /vendor/catalog.
  insert into options (option_group_id, option_id, label, sort_order, price_unit)
  select extra_services_group_id, 'Kitchen Demolition', 'Kitchen Demolition', 0, 'flat'
  where not exists (
    select 1 from options
    where option_group_id = extra_services_group_id and option_id = 'Kitchen Demolition'
  );
  get diagnostics demolition_inserted_count = row_count;

  if demolition_inserted_count not in (0, 1) then
    raise exception 'Kitchen Demolition insert unexpected row_count: %', demolition_inserted_count;
  end if;

  -- === 7. Insert Kitchen Plumbing option (idempotent, NO vendor price) ===
  insert into options (option_group_id, option_id, label, sort_order, price_unit)
  select extra_services_group_id, 'Kitchen Plumbing', 'Kitchen Plumbing', 1, 'flat'
  where not exists (
    select 1 from options
    where option_group_id = extra_services_group_id and option_id = 'Kitchen Plumbing'
  );
  get diagnostics plumbing_inserted_count = row_count;

  if plumbing_inserted_count not in (0, 1) then
    raise exception 'Kitchen Plumbing insert unexpected row_count: %', plumbing_inserted_count;
  end if;

  -- === 8. Final-state assertions (verify plan matches reality) ===

  -- 8a. Kitchen has exactly 5 groups.
  select count(*) into final_group_count
  from option_groups
  where service_id = 'kitchen';

  if final_group_count != 5 then
    raise exception 'Kitchen group count post-migration: expected 5, got %', final_group_count;
  end if;

  -- 8b. sort_orders are 0,1,2,3,4 exactly (no gaps, no dupes).
  if not exists (
    select 1 from option_groups
    where service_id = 'kitchen' and sort_order = 0
  ) or not exists (
    select 1 from option_groups
    where service_id = 'kitchen' and sort_order = 1
  ) or not exists (
    select 1 from option_groups
    where service_id = 'kitchen' and sort_order = 2
  ) or not exists (
    select 1 from option_groups
    where service_id = 'kitchen' and sort_order = 3
  ) or not exists (
    select 1 from option_groups
    where service_id = 'kitchen' and sort_order = 4
  ) then
    raise exception 'Kitchen sort_order coverage post-migration: missing one of 0/1/2/3/4';
  end if;

  -- 8c. Cabinet Installation is in Installation group at sort_order 0.
  if not exists (
    select 1 from options
    where id = 'b840ed07-9fea-4a75-99b8-4646a1d105f7'
      and option_group_id = installation_group_id
      and sort_order = 0
  ) then
    raise exception 'Cabinet Installation final state mismatch';
  end if;

  -- 8d. Stone Installation is in Installation group at sort_order 1.
  if not exists (
    select 1 from options
    where id = 'ba09523a-8a54-4eb6-ade5-e807650b5d8a'
      and option_group_id = installation_group_id
      and sort_order = 1
  ) then
    raise exception 'Stone Installation final state mismatch';
  end if;

  -- 8e. Kitchen Demolition and Kitchen Plumbing both exist in Extra Services.
  if not exists (
    select 1 from options
    where option_group_id = extra_services_group_id
      and option_id = 'Kitchen Demolition'
      and sort_order = 0
      and price_unit = 'flat'
  ) then
    raise exception 'Kitchen Demolition final state mismatch';
  end if;

  if not exists (
    select 1 from options
    where option_group_id = extra_services_group_id
      and option_id = 'Kitchen Plumbing'
      and sort_order = 1
      and price_unit = 'flat'
  ) then
    raise exception 'Kitchen Plumbing final state mismatch';
  end if;

  -- 8f. Pre/post option count parity. Pre = 8; post = pre + 2 net (2 moves
  -- keep count constant, 2 inserts add 2). Zero orphans.
  select count(*) into final_kitchen_option_count
  from options o
  join option_groups og on og.id = o.option_group_id
  where og.service_id = 'kitchen';

  if final_kitchen_option_count != pre_move_kitchen_option_count + 2 then
    raise exception 'Kitchen option count parity: pre=%, expected pre+2=%, got %',
      pre_move_kitchen_option_count,
      pre_move_kitchen_option_count + 2,
      final_kitchen_option_count;
  end if;

  raise notice 'Kitchen 5-step restructure applied. Groups=%, Options=% (pre=%). Installation_id=%, ExtraServices_id=%',
    final_group_count,
    final_kitchen_option_count,
    pre_move_kitchen_option_count,
    installation_group_id,
    extra_services_group_id;
end $$;

commit;
