-- HK-301 fix: qualify table ids in task RPC updates to avoid PL/pgSQL output-column ambiguity.

create or replace function public.formal_create_task(p_user_id uuid, p_activity_id uuid, p_team_id uuid, p_title text, p_description text, p_request_id text)
returns table (id uuid, team_id uuid, title text, description text, status text, progress integer, data_version bigint)
language plpgsql security definer set search_path = public as $$
declare new_task public.tasks;
begin
  if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active' and m.role in ('collaborator', 'host')) then raise exception 'task write forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams t where t.id = p_team_id and t.activity_id = p_activity_id and t.deleted_at is null) then raise exception 'team not found' using errcode = '23503'; end if;
  insert into public.tasks (activity_id, team_id, title, description, created_by, updated_by)
  values (p_activity_id, p_team_id, trim(p_title), coalesce(trim(p_description), ''), p_user_id, p_user_id) returning * into new_task;
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'task.create', 'task', new_task.id, p_request_id, 'success');
  return query select new_task.id, new_task.team_id, new_task.title, new_task.description, new_task.status, new_task.progress, new_task.data_version;
end; $$;

create or replace function public.formal_update_task_status(p_user_id uuid, p_activity_id uuid, p_task_id uuid, p_status text, p_expected_version bigint, p_request_id text)
returns table (id uuid, team_id uuid, title text, description text, status text, progress integer, data_version bigint)
language plpgsql security definer set search_path = public as $$
declare changed public.tasks;
begin
  if p_status not in ('todo', 'doing', 'done') then raise exception 'invalid task status' using errcode = '22023'; end if;
  if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active' and m.role in ('collaborator', 'host')) then raise exception 'task write forbidden' using errcode = '42501'; end if;
  update public.tasks as t set status = p_status, progress = case when p_status = 'done' then 100 when p_status = 'todo' then 0 else greatest(t.progress, 1) end, data_version = t.data_version + 1, updated_by = p_user_id, updated_at = timezone('utc', now()) where t.id = p_task_id and t.activity_id = p_activity_id and t.deleted_at is null and t.data_version = p_expected_version returning t.* into changed;
  if not found then raise exception 'task version conflict' using errcode = '40001'; end if;
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'task.update', 'task', changed.id, p_request_id, 'success');
  return query select changed.id, changed.team_id, changed.title, changed.description, changed.status, changed.progress, changed.data_version;
end; $$;

revoke all on function public.formal_create_task(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.formal_update_task_status(uuid, uuid, uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.formal_create_task(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.formal_update_task_status(uuid, uuid, uuid, text, bigint, text) to service_role;
