-- 122_catalog_image_urls_gap2.sql
-- Populate image_url for 2 options that were exhausted during batch-1 sourcing
-- and cleared for ship by kratos after the batch-1 PR (#598) merged.
--
-- 2 rows updated:
--   pool / heater          a1573ce5-8106-44f1-866f-c39eabe9df52  /catalog/pool/heater.jpg
--   pergolas / aluminum_terrace  0b15344f-0451-4e12-83eb-cb7585d4e361  /catalog/pergolas/aluminum_terrace.jpg
--
-- Sources: Unsplash free license (commercial OK, no attribution required)
--   pool/heater.jpg         — Unsplash 4VCm8l6wLQY (heat pump unit, outdoors)
--   pergolas/aluminum_terrace.jpg — Unsplash IL77Yq0n3_E (aluminum pergola structure)
--
-- 5 options declared ICON (no stock found across Pexels/Unsplash/Pixabay;
-- kratos ruling 1788372704370 at 18:1xZ):
--   pool / beach, pool / bubbler, blinds / roman, blinds / cellular,
--   fencing / privacy_slats  — image_url remains NULL (icon render path)
--
-- Applied after migration 121 (72-row batch-1 update). Assets ship in the
-- same PR so rows never point at 404s.
--
-- Post-verify: 0 NULL remaining among the 2 target UUIDs; no other rows touched.

begin;

do $$
declare
  target_ids constant uuid[] := array[
    'a1573ce5-8106-44f1-866f-c39eabe9df52'::uuid,  -- pool / heater
    '0b15344f-0451-4e12-83eb-cb7585d4e361'::uuid   -- pergolas / aluminum_terrace
  ];
  pre_null_count  int;
  updated_count   int;
  post_null_count int;
begin
  -- Pre-verify: both rows exist and are currently NULL
  select count(*)
  into pre_null_count
  from public.options
  where id = any(target_ids)
    and image_url is null;
  if pre_null_count <> 2 then
    raise exception
      'Migration 122 pre-check failed: expected 2/2 target rows with image_url NULL, found % (already populated or row missing — investigate before re-applying)',
      pre_null_count;
  end if;

  update public.options
     set image_url = case id
       when 'a1573ce5-8106-44f1-866f-c39eabe9df52'::uuid then '/catalog/pool/heater.jpg'
       when '0b15344f-0451-4e12-83eb-cb7585d4e361'::uuid then '/catalog/pergolas/aluminum_terrace.jpg'
     end
   where id = any(target_ids);
  get diagnostics updated_count = row_count;
  if updated_count <> 2 then
    raise exception
      'Migration 122 aborted: expected UPDATE 2 rows, got %', updated_count;
  end if;

  select count(*)
  into post_null_count
  from public.options
  where id = any(target_ids)
    and image_url is null;
  if post_null_count <> 0 then
    raise exception
      'Migration 122 post-check failed: expected 0 NULL remaining, found %', post_null_count;
  end if;

  raise notice
    'Migration 122 applied: updated=% target_null_after=%',
    updated_count, post_null_count;
end;
$$;

commit;
