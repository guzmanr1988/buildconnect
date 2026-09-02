-- 126_options_rename_stone_install_cabinet_install.sql
-- Renames two rows in public.options to remove the option_id/label mismatch
-- class filed 2026-08-05 (task_1785920096493_285). Removes the string trap;
-- does NOT guard around it.
--
-- Ground truth read straight off prod 2026-09-02 (supabase mgmt API, joined
-- to option_groups so og_group is measured not inferred).
--
-- IMPORTANT: this listing is the RESULT OF A FILTER (option_id LIKE cabinet%/
-- stone install% OR label LIKE %quartz%), NOT the full contents of each group.
-- The Stone group in particular has a third member (Granite, id 5b03c6e6-7525-
-- 4c37-81ab-c0b3974547f6) that the filter did not surface. Do not derive a
-- per-group row-count from this block — it would raise on a correct database.
--
--   Stone group (og_group="Stone", og_label="Stone")
--     0fc2f8b0-f3f7-446e-82ff-8d4fedc3ab40  option_id="Stone Install"   label="Quartz "   image_url=/catalog/kitchen/quartz.jpg
--     89a9bd3f-a36e-4c9b-a623-88b85f9657cc  option_id="Quartzite"       label="Quartzite" image_url=/catalog/kitchen/quartzite.jpg
--     (5b03c6e6-...   option_id="Granite" label="Granite" — present in group, not in filter output)
--
--   Cabinets group (og_group="Cabinets", og_label="Cabinet")
--     4419f5dd-8836-483c-b244-0169ee625301  option_id="Cabinet Install" label="Cabinet"   image_url=/catalog/kitchen/cabinet.jpg
--
--   Installation group (og_group="Installation") — INTENTIONALLY UNTOUCHED,
--   these ARE the service tiles and are correctly named on both fields:
--     b840ed07-9fea-4a75-99b8-4646a1d105f7  option_id="Cabinet Installation" label="Cabinet Installation"
--     ba09523a-8a54-4eb6-ade5-e807650b5d8a  option_id="Stone Installation"   label="Stone Installation"
--
-- Change:
--   (1) 0fc2f8b0  option_id "Stone Install"   -> "Quartz",  label "Quartz " -> "Quartz" (trailing-space trim, both in one UPDATE)
--   (2) 4419f5dd  option_id "Cabinet Install" -> "Cabinet"  (label already "Cabinet")
--
-- Invariant restored: option_id == label on both material rows, matching the
-- Granite/Quartzite sibling pattern that task_285 identified as the class.
--
-- Blast radius (kratos vilbs, wide sweep across every public base table, word-
-- boundary regex `\yStone Install\y|\yCabinet Install\y` on to_jsonb(t.*)::text):
-- ONLY public.options matches, n=2 (targets only). No sent_projects, no
-- draft_projects, no archive tables, no vendor_option_prices text snapshot.
-- vendor_option_prices.option_id is data_type=uuid (FK). project_items has 0
-- rows. Re-runs inside the transaction as the pre-check below so the number
-- is measured at merge time, not inferred from a prior read.
--
-- Sweep semantics deliberately split by scope (kratos vilbs):
--   in-migration post-check on options.option_id : EXACT match (=)
--     — exact is only meaningful when the LHS is a column; substring vs
--       "Cabinet Installation"/"Stone Installation" would false-positive on
--       the correctly-named service rows.
--   wide 88-table pre-check on to_jsonb(t.*)::text : WORD-BOUNDARY regex (~)
--     — equality against a whole-row JSON blob is not expressible; word-
--       boundary is the predicate that separates the target literals from
--       the "Installation" service rows without a per-table column list.
--
-- Uniqueness: options carries UNIQUE (option_group_id, option_id) — per-group,
-- not global. 'Quartz' only needs to be free within the Stone group; 'Cabinet'
-- only within the Cabinets group. Both verified empty pre-migration below.
--
-- Frontend map edits (dead-code hygiene for the old option_id map keys) ship
-- as a separate follow-up PR after this migration lands. Split from this PR
-- because the two changes cross-verify only in the deployed direction: the
-- migration must land first so removing the old keys reads as removing dead
-- code rather than removing behaviour. Reachability of those keys is dead
-- either way (TileIcon is XOR isCardTile AND NOT isImageTile and both
-- material rows carry photos post-migration 121/124), so no functional risk
-- in the split — only ordering clarity.
--
-- Sweep table set enumerated via information_schema.tables — privilege-
-- filtered by SQL standard: shows only tables the RUNNING ROLE has SELECT on.
-- On this database the migration runs as postgres via supabase mgmt API, so
-- 88 tables here equals pg_class.relkind='r' with partitioned parents
-- excluded (kratos verified independently pre-merge). Under a lesser role a
-- table without SELECT would silently drop out of the loop and the sweep
-- would read clean on a table it never opened — failure direction is FALSE-
-- CLEAN. If the running-role assumption ever changes, switch the enumerator
-- to pg_class.relkind='r' (unfiltered by privilege). "The sweep scanned
-- everything" is a claim scoped to postgres-role, not universal.

begin;

do $$
declare
  quartz_id   constant uuid := '0fc2f8b0-f3f7-446e-82ff-8d4fedc3ab40';
  cabinet_id  constant uuid := '4419f5dd-8836-483c-b244-0169ee625301';
  cabinet_installation_id constant uuid := 'b840ed07-9fea-4a75-99b8-4646a1d105f7';
  stone_installation_id   constant uuid := 'ba09523a-8a54-4eb6-ade5-e807650b5d8a';
  quartz_group_id  uuid;
  cabinet_group_id uuid;
  pre_quartz  int;
  pre_cabinet int;
  pre_service int;
  pre_unique_quartz  int;
  pre_unique_cabinet int;
  pre_sweep_target   int;
  rec record;
  found_count int;
  updated     int;
  post_bad    int;
  post_service int;
begin
  -- Pre-check 1: both target rows exist with expected pre-rename values.
  select option_group_id into quartz_group_id  from public.options where id = quartz_id;
  select option_group_id into cabinet_group_id from public.options where id = cabinet_id;

  select count(*) into pre_quartz
    from public.options
   where id = quartz_id and option_id = 'Stone Install' and label = 'Quartz ';
  if pre_quartz <> 1 then
    raise exception 'Migration 126 pre-check failed: quartz row expected (option_id=Stone Install, label=Quartz-with-trailing-space), got count=%', pre_quartz;
  end if;

  select count(*) into pre_cabinet
    from public.options
   where id = cabinet_id and option_id = 'Cabinet Install' and label = 'Cabinet';
  if pre_cabinet <> 1 then
    raise exception 'Migration 126 pre-check failed: cabinet row expected (option_id=Cabinet Install, label=Cabinet), got count=%', pre_cabinet;
  end if;

  -- Pre-check 2: Installation-group service rows exist and are correctly named.
  select count(*) into pre_service
    from public.options
   where (id = cabinet_installation_id and option_id = 'Cabinet Installation' and label = 'Cabinet Installation')
      or (id = stone_installation_id   and option_id = 'Stone Installation'   and label = 'Stone Installation');
  if pre_service <> 2 then
    raise exception 'Migration 126 pre-check failed: Installation-group service rows expected 2 matching, got %', pre_service;
  end if;

  -- Pre-check 3: uniqueness of the new option_id values within their groups.
  -- Constraint is UNIQUE (option_group_id, option_id) — per-group, not global.
  select count(*) into pre_unique_quartz
    from public.options
   where option_group_id = quartz_group_id and option_id = 'Quartz' and id <> quartz_id;
  if pre_unique_quartz <> 0 then
    raise exception 'Migration 126 pre-check failed: option_id=Quartz already exists in Stone group, count=% — would collide with UNIQUE(option_group_id, option_id)', pre_unique_quartz;
  end if;

  select count(*) into pre_unique_cabinet
    from public.options
   where option_group_id = cabinet_group_id and option_id = 'Cabinet' and id <> cabinet_id;
  if pre_unique_cabinet <> 0 then
    raise exception 'Migration 126 pre-check failed: option_id=Cabinet already exists in Cabinets group, count=% — would collide with UNIQUE(option_group_id, option_id)', pre_unique_cabinet;
  end if;

  -- Pre-check 4: wide sweep — word-boundary regex over every public base table's
  -- to_jsonb(t.*)::text form. Positive control: sum over options must return 2
  -- (target rows carry the literals). Guarantee: sum over every OTHER table
  -- must return 0 (no dangling text snapshot elsewhere). A zero-total sweep is
  -- unfalsifiable on its own (typo'd regex reads as clean); the two-scope
  -- split makes the predicate demonstrably fire before we trust its zeros.
  pre_sweep_target := 0;
  for rec in
    select table_schema, table_name
      from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  loop
    execute format(
      'select count(*) from %I.%I t where to_jsonb(t.*)::text ~ %L',
      rec.table_schema, rec.table_name, '\yStone Install\y|\yCabinet Install\y'
    ) into found_count;
    if rec.table_name = 'options' then
      pre_sweep_target := pre_sweep_target + found_count;
    elsif found_count > 0 then
      raise exception 'Migration 126 pre-sweep failed: literal present in %.%, count=% — rename would orphan a text snapshot outside options', rec.table_schema, rec.table_name, found_count;
    end if;
  end loop;
  if pre_sweep_target <> 2 then
    raise exception 'Migration 126 pre-sweep positive control failed: options should carry both literals pre-migration, count=% (expected 2) — predicate may be misconstructed', pre_sweep_target;
  end if;

  -- (1) Stone/Quartz material rename + trailing-space trim, single UPDATE.
  update public.options
     set option_id = 'Quartz',
         label     = 'Quartz'
   where id = quartz_id;
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'Migration 126 quartz update expected UPDATE 1, got %', updated;
  end if;

  -- (2) Cabinets/Cabinet material rename (label already correct).
  update public.options
     set option_id = 'Cabinet'
   where id = cabinet_id;
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'Migration 126 cabinet update expected UPDATE 1, got %', updated;
  end if;

  -- Post-check 1: exact-match old literals gone from options.option_id.
  -- (Substring vs "Cabinet Installation"/"Stone Installation" would misclassify
  -- the correctly-named service rows as a failure — exact is the invariant.)
  select count(*) into post_bad
    from public.options
   where option_id = 'Stone Install' or option_id = 'Cabinet Install';
  if post_bad <> 0 then
    raise exception 'Migration 126 post-check failed: exact old literals still present in options.option_id, count=%', post_bad;
  end if;

  -- Post-check 2: Installation-group service rows unchanged.
  select count(*) into post_service
    from public.options
   where (id = cabinet_installation_id and option_id = 'Cabinet Installation' and label = 'Cabinet Installation')
      or (id = stone_installation_id   and option_id = 'Stone Installation'   and label = 'Stone Installation');
  if post_service <> 2 then
    raise exception 'Migration 126 post-check failed: Installation-group service rows drifted, count=%', post_service;
  end if;

  raise notice 'Migration 126 applied: renamed 2 material rows (Cabinet, Quartz), 2 service rows untouched, wide pre-sweep clean';
end;
$$;

commit;
