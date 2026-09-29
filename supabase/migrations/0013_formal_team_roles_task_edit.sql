-- HK-301: team-level captain/member roles and task edit boundaries.

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete restrict,
  role text not null check (role in ('captain', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (team_id, user_id)
);

create index if not exists team_memberships_user_team_idx on public.team_memberships(user_id, team_id, status);
alter table public.team_memberships enable row level security;

insert into public.team_memberships (team_id, user_id, role)
select t.id, t.created_by, 'captain'
from public.teams t
where t.deleted_at is null
on conflict (team_id, user_id) do update set role = 'captain', status = 'active', updated_at = timezone('utc', now());

create or replace function public.formal_list_activity_teams_v3(p_user_id uuid, p_activity_id uuid)
returns table (id uuid, name text, description text, task_count bigint, sort_order integer, data_version bigint, team_role text)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.description,
    (select count(*) from public.tasks x where x.team_id = t.id and x.deleted_at is null),
    t.sort_order, t.data_version, coalesce(tm.role, 'member')
  from public.teams t
  left join public.team_memberships tm on tm.team_id = t.id and tm.user_id = p_user_id and tm.status = 'active'
  where t.activity_id = p_activity_id and t.deleted_at is null
    and exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active')
  order by t.sort_order, t.created_at;
$$;

drop function if exists public.formal_create_team(uuid, uuid, text, text, text);

create or replace function public.formal_create_team(p_user_id uuid, p_activity_id uuid, p_name text, p_description text, p_request_id text)
returns table (id uuid, name text, description text, task_count bigint, sort_order integer, data_version bigint, team_role text)
language plpgsql security definer set search_path = public as $$
declare new_team public.teams;
begin
  if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active' and m.role = 'host') then raise exception 'team create forbidden' using errcode = '42501'; end if;
  insert into public.teams (activity_id, name, normalized_name, description, created_by) values (p_activity_id, trim(p_name), lower(trim(p_name)), coalesce(trim(p_description), ''), p_user_id) returning * into new_team;
  insert into public.team_memberships (team_id, user_id, role) values (new_team.id, p_user_id, 'captain');
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'team.create', 'team', new_team.id, p_request_id, 'success');
  return query select new_team.id, new_team.name, new_team.description, 0::bigint, new_team.sort_order, new_team.data_version, 'captain'::text;
end; $$;

create or replace function public.formal_create_task(p_user_id uuid, p_activity_id uuid, p_team_id uuid, p_title text, p_description text, p_request_id text)
returns table (id uuid, team_id uuid, title text, description text, status text, progress integer, data_version bigint)
language plpgsql security definer set search_path = public as $$
declare new_task public.tasks;
begin
  if not exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id where tm.team_id = p_team_id and tm.user_id = p_user_id and tm.role = 'captain' and tm.status = 'active' and t.activity_id = p_activity_id and t.deleted_at is null) then raise exception 'task create forbidden' using errcode = '42501'; end if;
  insert into public.tasks (activity_id, team_id, title, description, created_by, updated_by) values (p_activity_id, p_team_id, trim(p_title), coalesce(trim(p_description), ''), p_user_id, p_user_id) returning * into new_task;
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'task.create', 'task', new_task.id, p_request_id, 'success');
  return query select new_task.id, new_task.team_id, new_task.title, new_task.description, new_task.status, new_task.progress, new_task.data_version;
end; $$;

create or replace function public.formal_update_task_details(p_user_id uuid, p_activity_id uuid, p_task_id uuid, p_title text, p_description text, p_expected_version bigint, p_request_id text)
returns table (id uuid, team_id uuid, title text, description text, status text, progress integer, data_version bigint)
language plpgsql security definer set search_path = public as $$
declare changed public.tasks;
begin
  if not exists (select 1 from public.team_memberships tm join public.tasks x on x.team_id = tm.team_id where x.id = p_task_id and x.activity_id = p_activity_id and tm.user_id = p_user_id and tm.role = 'captain' and tm.status = 'active') then raise exception 'task edit forbidden' using errcode = '42501'; end if;
  update public.tasks as t set title = trim(p_title), description = coalesce(trim(p_description), ''), data_version = t.data_version + 1, updated_by = p_user_id, updated_at = timezone('utc', now()) where t.id = p_task_id and t.activity_id = p_activity_id and t.deleted_at is null and t.data_version = p_expected_version returning t.* into changed;
  if not found then raise exception 'task version conflict' using errcode = '40001'; end if;
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'task.update', 'task', changed.id, p_request_id, 'success');
  return query select changed.id, changed.team_id, changed.title, changed.description, changed.status, changed.progress, changed.data_version;
end; $$;

create or replace function public.formal_update_task_progress(p_user_id uuid, p_activity_id uuid, p_task_id uuid, p_status text, p_progress integer, p_expected_version bigint, p_request_id text)
returns table (id uuid, team_id uuid, title text, description text, status text, progress integer, data_version bigint)
language plpgsql security definer set search_path = public as $$
declare changed public.tasks; team_role text; assigned_membership uuid; next_status text; next_progress integer;
begin
  if p_progress < 0 or p_progress > 100 then raise exception 'invalid task progress' using errcode = '22023'; end if;
  select tm.role into team_role from public.team_memberships tm join public.tasks x on x.team_id = tm.team_id where x.id = p_task_id and x.activity_id = p_activity_id and tm.user_id = p_user_id and tm.status = 'active';
  select m.id into assigned_membership from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active';
  select t.status into next_status from public.tasks t where t.id = p_task_id and t.activity_id = p_activity_id and t.deleted_at is null;
  if team_role = 'captain' then
    if p_status not in ('todo', 'doing', 'done') then raise exception 'invalid task status' using errcode = '22023'; end if;
    next_status := p_status; next_progress := case when p_status = 'done' then 100 when p_status = 'todo' then 0 else greatest(p_progress, 1) end;
  elsif assigned_membership is not null and exists (select 1 from public.tasks t where t.id = p_task_id and t.assignee_membership_id = assigned_membership) then
    next_progress := p_progress;
  else
    raise exception 'task progress forbidden' using errcode = '42501';
  end if;
  update public.tasks as t set status = next_status, progress = next_progress, data_version = t.data_version + 1, updated_by = p_user_id, updated_at = timezone('utc', now()) where t.id = p_task_id and t.activity_id = p_activity_id and t.deleted_at is null and t.data_version = p_expected_version returning t.* into changed;
  if not found then raise exception 'task version conflict' using errcode = '40001'; end if;
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'task.update', 'task', changed.id, p_request_id, 'success');
  return query select changed.id, changed.team_id, changed.title, changed.description, changed.status, changed.progress, changed.data_version;
end; $$;

revoke all on function public.formal_list_activity_teams_v3(uuid, uuid) from public, anon, authenticated;
revoke all on function public.formal_create_team(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.formal_create_task(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.formal_update_task_details(uuid, uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.formal_update_task_progress(uuid, uuid, uuid, text, integer, bigint, text) from public, anon, authenticated;
grant execute on function public.formal_list_activity_teams_v3(uuid, uuid) to service_role;
grant execute on function public.formal_create_team(uuid, uuid, text, text, text) to service_role;
grant execute on function public.formal_create_task(uuid, uuid, uuid, text, text, text) to service_role;
grant execute on function public.formal_update_task_details(uuid, uuid, uuid, text, text, bigint, text) to service_role;
grant execute on function public.formal_update_task_progress(uuid, uuid, uuid, text, integer, bigint, text) to service_role;
