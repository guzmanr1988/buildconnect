-- 124_catalog_image_urls_kitchen_quartz.sql
-- Adds quartz.jpg for the Quartz stone option in the Kitchen service.
-- Granite and Quartzite already have photos; Quartz was the remaining gap.
-- Sibling discrimination confirmed: granite=dark speckled, quartzite=natural multicolor,
-- quartz=clean bright white uniform — clearly distinct at 232px thumbnail.
--
-- Source: Pexels 6587908 (white kitchen with quartz island, Pexels free license)
-- Asset: /catalog/kitchen/quartz.jpg, 2600x1462, q82, progressive JPEG
--
-- Other kitchen NULL options (Kitchen Demolition, Kitchen Plumbing, Stone Installation)
-- are service scope/extra-service options, not photographable products — ICON path.

begin;

do $$
declare
  quartz_id    constant uuid := '0fc2f8b0-f3f7-446e-82ff-8d4fedc3ab40';
  pre_null     int;
  updated      int;
  post_null    int;
begin
  select count(*) into pre_null
  from public.options
  where id = quartz_id and image_url is null;
  if pre_null <> 1 then
    raise exception 'Migration 124 pre-check failed: expected 1 NULL row, found %', pre_null;
  end if;

  update public.options set image_url = '/catalog/kitchen/quartz.jpg'
  where id = quartz_id;
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'Migration 124 aborted: expected UPDATE 1, got %', updated;
  end if;

  select count(*) into post_null
  from public.options
  where id = quartz_id and image_url is null;
  if post_null <> 0 then
    raise exception 'Migration 124 post-check failed: expected 0 NULL remaining, found %', post_null;
  end if;

  raise notice 'Migration 124 applied: updated=% target_null_after=%', updated, post_null;
end;
$$;

commit;
