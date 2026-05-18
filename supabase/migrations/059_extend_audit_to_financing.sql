-- 059_extend_audit_to_financing.sql
-- Extend public.audit_table_change() to cover financing_applications +
-- customer_financing_profile lifecycle mutations.
--
-- PR-268 ship surfaced the gap: temp admin financing-stepper writes
-- both rows via admin-JWT supabase-js; under 053's lenders+feature_flags
-- registered coverage, fa+cfp mutations had no audit trail. Walker-stuck
-- diagnostic confirmed post-seed audit_log probe returned 0 rows on
-- seeded fa+cfp ids — registration gap, not column-agnostic-primitive
-- gap (053 to_jsonb(NEW/OLD) shape carries any table; coverage is just
-- which TG_TABLE_NAME branches the function handles + which triggers
-- are registered).
--
-- Action mapping (uses existing audit_action enum — no widen, per
-- feedback_enum_widen_avoidance_use_json_delta):
--   - financing_applications INSERT       -> 'insert'
--   - financing_applications UPDATE       -> 'update' (status transitions
--                                              captured via after_json.status
--                                              field-delta — state-machine
--                                              forensic trace is jsonb-diff
--                                              not enum-grep)
--   - customer_financing_profile INSERT   -> 'insert'
--   - customer_financing_profile UPDATE   -> 'update' (envelope set +
--                                              last_known_status transitions
--                                              both captured in jsonb deltas;
--                                              terms_accepted enum-coverage
--                                              gap on financing_status_v1
--                                              handled by null-fallback per
--                                              banked memory — audit captures
--                                              null<->non-null in after_json
--                                              regardless, forensic-equivalent
--                                              under generic 'update')
--
-- Field mapping (per 053 contract; byte-exact for new branches):
--   - target_id = NEW.id::text   for both (both have uuid PK)
--   - before_json/after_json     unchanged from 053 generic capture
--
-- Hardening: function-level attrs preserved on body-only diff via CREATE
-- OR REPLACE (SECURITY DEFINER + search_path=public + REVOKEs survive).
-- Triggers registered AFTER INSERT OR UPDATE, mirroring 053 trigger
-- registration for lenders + feature_flags.
--
-- Walker-validates-lifecycle-class assertion: post-apply apollo walker
-- re-fire on PR-268 stepper button-clicks expects >=1 audit_log row per
-- click on BOTH fa + cfp targets (per banked
-- feedback_audit_trigger_walker_validates_lifecycle_class).
--
-- Diff vs 053 (additive-only on TG_TABLE_NAME chain; no behavior change
-- on lenders + feature_flags branches; trigger registration adds 2 new
-- pg_trigger rows, end-state count = 4 audit-change triggers across the
-- 4 covered tables).

create or replace function public.audit_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id   uuid := auth.uid();
  v_actor_role text;
  v_action     audit_action;
  v_target_id  text;
  v_before     jsonb;
  v_after      jsonb;
begin
  -- actor_role lookup (nullable; profiles.role may be missing for
  -- service_role or unauthenticated writes)
  if v_actor_id is not null then
    select role into v_actor_role from public.profiles where id = v_actor_id;
  end if;

  -- Action enum mapping
  if TG_TABLE_NAME = 'feature_flags' then
    v_action    := 'toggle'::audit_action;
    v_target_id := case
      when TG_OP = 'DELETE' then OLD.key
      else NEW.key
    end;
  elsif TG_TABLE_NAME = 'lenders' then
    -- Hephaestus item (g): UPDATE detection branches on soft-delete
    -- transition. OLD.deleted_at NULL -> NEW.deleted_at NOT NULL = retire
    -- intent -> emit 'delete'. UNDELETE (NOT NULL -> NULL) stays 'update'
    -- (no undelete enum value; reviewer reads before/after_json for
    -- intent).
    v_action    := case
      when TG_OP = 'INSERT' then 'insert'::audit_action
      when TG_OP = 'UPDATE'
       and OLD.deleted_at is null
       and NEW.deleted_at is not null then 'delete'::audit_action
      when TG_OP = 'UPDATE' then 'update'::audit_action
      else 'update'::audit_action
    end;
    v_target_id := case
      when TG_OP = 'DELETE' then OLD.id::text
      else NEW.id::text
    end;
  elsif TG_TABLE_NAME = 'financing_applications' then
    -- Lifecycle table: status transitions (applied -> approved ->
    -- terms_accepted / denied / expired). No soft-delete column;
    -- INSERT vs UPDATE branches map directly to generic action values.
    -- Forensic trace via after_json.status vs before_json.status diff.
    v_action    := case
      when TG_OP = 'INSERT' then 'insert'::audit_action
      else 'update'::audit_action
    end;
    v_target_id := case
      when TG_OP = 'DELETE' then OLD.id::text
      else NEW.id::text
    end;
  elsif TG_TABLE_NAME = 'customer_financing_profile' then
    -- Lifecycle table: envelope (last_known_amount_cents +
    -- approval_partner + approval_expires_at) set at admin-create-approval
    -- Edge Fn; last_known_status transitions during stepper +
    -- adapter-callback paths. State-machine trace via
    -- after_json.last_known_status field-delta.
    v_action    := case
      when TG_OP = 'INSERT' then 'insert'::audit_action
      else 'update'::audit_action
    end;
    v_target_id := case
      when TG_OP = 'DELETE' then OLD.id::text
      else NEW.id::text
    end;
  else
    -- Unrecognized table — fail closed (do not log + do not block the
    -- original DML)
    return case when TG_OP = 'DELETE' then OLD else NEW end;
  end if;

  -- Before/after JSON
  if TG_OP = 'UPDATE' then
    v_before := to_jsonb(OLD);
    v_after  := to_jsonb(NEW);
  elsif TG_OP = 'INSERT' then
    v_before := null;
    v_after  := to_jsonb(NEW);
  end if;

  insert into public.audit_log (
    actor_id, actor_role, action, target_table, target_id, before_json, after_json
  ) values (
    v_actor_id, v_actor_role, v_action, TG_TABLE_NAME, v_target_id, v_before, v_after
  );

  return case when TG_OP = 'DELETE' then OLD else NEW end;
end;
$$;

revoke execute on function public.audit_table_change() from public;
revoke execute on function public.audit_table_change() from anon, authenticated;
-- trigger context owns invocation; no EXECUTE grant to client roles

-- financing_applications triggers
drop trigger if exists financing_applications_audit_change on public.financing_applications;
create trigger financing_applications_audit_change
  after insert or update on public.financing_applications
  for each row execute function public.audit_table_change();

-- customer_financing_profile triggers
drop trigger if exists customer_financing_profile_audit_change on public.customer_financing_profile;
create trigger customer_financing_profile_audit_change
  after insert or update on public.customer_financing_profile
  for each row execute function public.audit_table_change();
