-- HK-301: activity deadlines and real task progress updates.

alter table public.activities add column if not exists deadline_at timestamptz;

create or replace function public.formal_list_accessible_activities_v2(p_user_id uuid)
returns table (id uuid, title text, description text, deadline_at timestamptz, status text, data_version bigint, role text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select a.id, a.title, a.description, a.deadline_at, a.status, a.data_version, m.role, a.updated_at
  from public.memberships m join public.activities a on a.id = m.activity_id
  where m.user_id = p_user_id and m.status = 'active' and a.status <> 'deleted'
  order by a.updated_at desc;
$$;

create or replace function public.formal_update_task_progress(
  p_user_id uuid, p_activity_id uuid, p_task_id uuid, p_status text, p_progress integer, p_expected_version bigint, p_request_id text
)
returns table (id uuid, team_id uuid, title text, description text, status text, progress integer, data_version bigint)
language plpgsql security definer set search_path = public as $$
declare changed public.tasks; normalized_progress integer;
begin
  if p_status not in ('todo', 'doing', 'done') or p_progress < 0 or p_progress > 100 then raise exception 'invalid task progress' using errcode = '22023'; end if;
  if p_status = 'done' then normalized_progress := 100; elsif p_status = 'todo' then normalized_progress := 0; else normalized_progress := greatest(p_progress, 1); end if;
  if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active' and m.role in ('collaborator', 'host')) then raise exception 'task write forbidden' using errcode = '42501'; end if;
  update public.tasks as t set status = p_status, progress = normalized_progress, data_version = t.data_version + 1, updated_by = p_user_id, updated_at = timezone('utc', now())
    where t.id = p_task_id and t.activity_id = p_activity_id and t.deleted_at is null and t.data_version = p_expected_version returning t.* into changed;
  if not found then raise exception 'task version conflict' using errcode = '40001'; end if;
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result)
  values (p_activity_id, p_user_id, 'task.update', 'task', changed.id, p_request_id, 'success');
  return query select changed.id, changed.team_id, changed.title, changed.description, changed.status, changed.progress, changed.data_version;
end; $$;

revoke all on function public.formal_list_accessible_activities_v2(uuid) from public, anon, authenticated;
revoke all on function public.formal_update_task_progress(uuid, uuid, uuid, text, integer, bigint, text) from public, anon, authenticated;
grant execute on function public.formal_list_accessible_activities_v2(uuid) to service_role;
grant execute on function public.formal_update_task_progress(uuid, uuid, uuid, text, integer, bigint, text) to service_role;
