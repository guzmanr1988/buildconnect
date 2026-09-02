-- 123_catalog_image_urls_windows_doors.sql
-- Populate image_url for 3 photographable product options in Impact Windows & Doors.
-- Storm Front (52b486d1-349d-4c61-8cd1-9761f871bf61) declared ICON: free stock has no
-- clean residential aluminum-framed impact glass entry panel photo after 5 search passes
-- (Pexels, Unsplash, Pixabay); image_url stays NULL.
--
-- Sources (Unsplash free license — commercial OK, no attribution required):
--   windows.jpg      — Pexels 8678676 (structural glazing close-up)
--   doors.jpg        — Pexels 5252546 (aluminum + glass entry door with sidelights)
--   garage_doors.jpg — Unsplash 3qRx6B4cT6g (full-view glass panel sectional garage doors)
--
-- Applied after migration 122. Assets ship in the same PR.

begin;

do $$
declare
  windows_id     constant uuid := 'be7e0e6a-dc78-48fa-8e47-12780c8b4e49';
  doors_id       constant uuid := 'de305c48-c3e5-447e-8da4-cb1bbeb8ab6b';
  garage_id      constant uuid := 'c92929fd-5112-4288-bcc1-68f649f4df60';
  target_ids     constant uuid[] := array[windows_id, doors_id, garage_id];
  pre_null_count  int;
  updated_count   int;
  post_null_count int;
begin
  select count(*)
  into pre_null_count
  from public.options
  where id = any(target_ids)
    and image_url is null;
  if pre_null_count <> 3 then
    raise exception
      'Migration 123 pre-check failed: expected 3/3 target rows with image_url NULL, found %',
      pre_null_count;
  end if;

  update public.options
     set image_url = case id
       when windows_id then '/catalog/windows_doors/windows.jpg'
       when doors_id   then '/catalog/windows_doors/doors.jpg'
       when garage_id  then '/catalog/windows_doors/garage_doors.jpg'
     end
   where id = any(target_ids);
  get diagnostics updated_count = row_count;
  if updated_count <> 3 then
    raise exception
      'Migration 123 aborted: expected UPDATE 3 rows, got %', updated_count;
  end if;

  select count(*)
  into post_null_count
  from public.options
  where id = any(target_ids)
    and image_url is null;
  if post_null_count <> 0 then
    raise exception
      'Migration 123 post-check failed: expected 0 NULL remaining, found %', post_null_count;
  end if;

  raise notice
    'Migration 123 applied: updated=% target_null_after=%',
    updated_count, post_null_count;
end;
$$;

commit;
