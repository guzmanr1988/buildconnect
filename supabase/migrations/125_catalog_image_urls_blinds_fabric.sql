-- 125_catalog_image_urls_blinds_fabric.sql
-- Adds fabric.jpg for the Fabric material option in the Blinds service.
-- Other blinds material options (Aluminum, Bamboo, Faux Wood, Vinyl, Real Wood) already have photos.
--
-- Source: Pexels 4220436 (close-up fabric vertical blinds, woven textile texture, Pexels free license)
-- Asset: /catalog/blinds/fabric.jpg, 2600x1462, q82, progressive JPEG
--
-- Other blinds NULL options are ICON path (abstract properties):
--   control: Cordless, Motorized, Traditional Cord, Wand — mechanism types, not visually distinct
--   light_control: Blackout, Light Filtering, Room Darkening, Sheer — abstract light transmission
--   mount: Inside Mount, Outside Mount — installation method, abstract
--   type: Cellular/Honeycomb, Roman Shades — ICON declared in migration 122
--   type: Motorized/Smart — ICON after 2 search passes, motor housing not available in free stock

begin;

do $$
declare
  fabric_id    constant uuid := 'dba62960-e9c1-4dd2-8805-5916cb8920d1';
  pre_null     int;
  updated      int;
  post_null    int;
begin
  select count(*) into pre_null
  from public.options
  where id = fabric_id and image_url is null;
  if pre_null <> 1 then
    raise exception 'Migration 125 pre-check failed: expected 1 NULL row, found %', pre_null;
  end if;

  update public.options set image_url = '/catalog/blinds/fabric.jpg'
  where id = fabric_id;
  get diagnostics updated = row_count;
  if updated <> 1 then
    raise exception 'Migration 125 aborted: expected UPDATE 1, got %', updated;
  end if;

  select count(*) into post_null
  from public.options
  where id = fabric_id and image_url is null;
  if post_null <> 0 then
    raise exception 'Migration 125 post-check failed: expected 0 NULL remaining, found %', post_null;
  end if;

  raise notice 'Migration 125 applied: updated=% target_null_after=%', updated, post_null;
end;
$$;

commit;
