-- Repair migration: restore the host-only activity update RPC if 0012 was
-- recorded as applied before its function reached the remote database.

create or replace function public.formal_update_activity(
  p_user_id uuid, p_activity_id uuid, p_title text, p_description text,
  p_deadline_at timestamptz, p_status text, p_expected_version bigint, p_request_id text
)
returns table (id uuid, title text, description text, deadline_at timestamptz, status text, data_version bigint, role text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare changed public.activities;
begin
  if p_status not in ('draft', 'open', 'paused', 'closed') then raise exception 'activity status invalid' using errcode = '22023'; end if;
  if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.role = 'host' and m.status = 'active') then raise exception 'activity update forbidden' using errcode = '42501'; end if;
  update public.activities as a
  set title = trim(p_title), description = coalesce(trim(p_description), ''), deadline_at = p_deadline_at,
      status = p_status, data_version = a.data_version + 1, updated_at = timezone('utc', now()), closed_at = case when p_status = 'closed' then coalesce(a.closed_at, timezone('utc', now())) else null end
  where a.id = p_activity_id and a.status not in ('deleted', 'archived') and a.data_version = p_expected_version
  returning a.* into changed;
  if not found then raise exception 'activity version conflict' using errcode = '40001'; end if;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result)
  values (changed.id, p_user_id, 'activity.update', 'activity', changed.id, p_request_id, 'success');
  return query select changed.id, changed.title, changed.description, changed.deadline_at, changed.status, changed.data_version, 'host'::text, changed.updated_at;
end; $$;

revoke all on function public.formal_update_activity(uuid, uuid, text, text, timestamptz, text, bigint, text) from public, anon, authenticated;
grant execute on function public.formal_update_activity(uuid, uuid, text, text, timestamptz, text, bigint, text) to service_role;
