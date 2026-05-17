-- 053_audit_triggers_lenders_and_feature_flags.sql
-- Audit-axis coverage for admin-financing direct-mutation surfaces.
--
-- AS-SHIPPED 048 puts audit_log behind service_role-only writes (no INSERT
-- policy) and the admin-create-approval Edge Fn writes via service_role.
-- The admin-financing FE (PR #259) writes lenders + feature_flags directly
-- via supabase-js with the admin JWT — those mutations would have NO
-- audit trail under the existing setup.
--
-- Trigger-based audit is the cleanest single-shot fix per kratos lens-6
-- call: avoids +5 Edge Fn round-trips per click (option a), avoids the
-- audit-gap-from-launch ergonomics of deferring (option c). The SECURITY
-- DEFINER trigger function bypasses audit_log RLS by virtue of running
-- under the function owner (postgres) — matches the service_role-only
-- write contract without granting any new write privileges to admin JWT.
--
-- Action mapping (uses existing audit_action enum values — no widen
-- needed):
--   - lenders INSERT                    → 'insert'
--   - lenders UPDATE (soft-delete trans)→ 'delete' (hephaestus item g:
--                                          OLD.deleted_at IS NULL AND
--                                          NEW.deleted_at IS NOT NULL —
--                                          admin trail must show retire
--                                          intent, not generic update)
--   - lenders UPDATE (any other diff)   → 'update'  (covers undelete +
--                                          renames + category moves;
--                                          before/after_json holds diff)
--   - feature_flags INSERT              → 'toggle'
--   - feature_flags UPDATE              → 'toggle'
--
-- Field mapping:
--   - actor_id     = auth.uid()           (nullable — service_role writes
--                                          land with actor_id=null)
--   - actor_role   = profiles.role lookup (nullable — same reason)
--   - target_table = TG_TABLE_NAME
--   - target_id    = NEW.id::text   for lenders (uuid PK)
--                  = NEW.key        for feature_flags (text PK; no id col)
--   - before_json  = to_jsonb(OLD) on UPDATE, NULL on INSERT
--   - after_json   = to_jsonb(NEW) always
--
-- Hardening per 048 convention: set search_path = public on the function;
-- revoke execute from public/anon/authenticated; trigger executes via
-- table-level trigger registration so EXECUTE grants on the function are
-- not the access path (defense-in-depth).

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
    -- transition. OLD.deleted_at NULL → NEW.deleted_at NOT NULL = retire
    -- intent → emit 'delete'. UNDELETE (NOT NULL → NULL) stays 'update'
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

-- lenders triggers
drop trigger if exists lenders_audit_change on public.lenders;
create trigger lenders_audit_change
  after insert or update on public.lenders
  for each row execute function public.audit_table_change();

-- feature_flags triggers
drop trigger if exists feature_flags_audit_change on public.feature_flags;
create trigger feature_flags_audit_change
  after insert or update on public.feature_flags
  for each row execute function public.audit_table_change();
