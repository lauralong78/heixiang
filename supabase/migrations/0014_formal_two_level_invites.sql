-- HK-301: host-to-captain and captain-to-member invite flows.

alter table public.activity_invites add column if not exists invite_type text not null default 'activity_member' check (invite_type in ('activity_team', 'team_member', 'activity_member'));
alter table public.activity_invites add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.activity_invites add column if not exists team_name text;
alter table public.activity_invite_uses add column if not exists accepted_team_id uuid references public.teams(id) on delete set null;
create index if not exists activity_invites_team_idx on public.activity_invites(team_id, status, created_at desc);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  assigned_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (task_id, membership_id)
);
alter table public.task_assignees enable row level security;

create or replace function public.formal_create_activity_invite_v2(
  p_user_id uuid, p_activity_id uuid, p_invite_type text, p_team_id uuid, p_team_name text,
  p_token_digest text, p_token_hint text, p_expires_at timestamptz, p_max_uses integer, p_request_id text
)
returns table (id uuid, activity_id uuid, invite_type text, team_id uuid, team_name text, token_hint text, expires_at timestamptz, max_uses integer, use_count integer, status text)
language plpgsql security definer set search_path = public as $$
declare created public.activity_invites;
begin
  if p_invite_type not in ('activity_team', 'team_member') then raise exception 'invite type invalid' using errcode = '22023'; end if;
  if p_invite_type = 'activity_team' then
    if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.role = 'host' and m.status = 'active') then raise exception 'team invite forbidden' using errcode = '42501'; end if;
    if p_team_id is not null or nullif(trim(p_team_name), '') is null then raise exception 'team invite data invalid' using errcode = '22023'; end if;
  else
    if not exists (select 1 from public.team_memberships tm join public.teams t on t.id = tm.team_id where tm.team_id = p_team_id and tm.user_id = p_user_id and tm.role = 'captain' and tm.status = 'active' and t.activity_id = p_activity_id and t.deleted_at is null) then raise exception 'member invite forbidden' using errcode = '42501'; end if;
    if p_team_id is null then raise exception 'member invite data invalid' using errcode = '22023'; end if;
  end if;
  insert into public.activity_invites (activity_id, invite_type, team_id, team_name, token_digest, token_hint, role, created_by, expires_at, max_uses)
  values (p_activity_id, p_invite_type, p_team_id, nullif(trim(p_team_name), ''), p_token_digest, p_token_hint, case when p_invite_type = 'activity_team' then 'collaborator' else 'member' end, p_user_id, p_expires_at, coalesce(p_max_uses, 50)) returning * into created;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'membership.invite', 'activity_invite', created.id, p_request_id, 'success');
  return query select created.id, created.activity_id, created.invite_type, created.team_id, created.team_name, created.token_hint, created.expires_at, created.max_uses, created.use_count, created.status;
end; $$;

create or replace function public.formal_join_activity_invite_v2(p_user_id uuid, p_token_digest text, p_request_id text)
returns table (activity_id uuid, membership_id uuid, role text, already_joined boolean, team_id uuid, invite_type text)
language plpgsql security definer set search_path = public as $$
declare invite_row public.activity_invites; existing public.memberships; joined public.memberships; team_row public.teams; team_member_row public.team_memberships; prior_use public.activity_invite_uses; activity_team boolean;
begin
  select i.* into invite_row from public.activity_invites i where i.token_digest = p_token_digest for update;
  if not found then raise exception 'invite invalid' using errcode = '22023'; end if;
  select iu.* into prior_use from public.activity_invite_uses iu where iu.invite_id = invite_row.id and iu.user_id = p_user_id;
  if found then return query select invite_row.activity_id, prior_use.membership_id, invite_row.role, true, prior_use.accepted_team_id, invite_row.invite_type; return; end if;
  if invite_row.status <> 'active' or (invite_row.expires_at is not null and invite_row.expires_at <= timezone('utc', now())) or invite_row.use_count >= invite_row.max_uses then raise exception 'invite invalid' using errcode = '22023'; end if;
  activity_team := invite_row.invite_type = 'activity_team';
  if activity_team then
    insert into public.memberships (activity_id, user_id, role, status, display_name)
    select invite_row.activity_id, p_user_id, 'collaborator', 'active', u.login_id from public.app_users u where u.id = p_user_id
    on conflict (activity_id, user_id) do update set status = 'active', role = 'collaborator', updated_at = timezone('utc', now())
    returning * into joined;
    insert into public.teams (activity_id, name, normalized_name, created_by) values (invite_row.activity_id, invite_row.team_name, lower(trim(invite_row.team_name)), p_user_id) returning * into team_row;
    insert into public.team_memberships (team_id, user_id, role) values (team_row.id, p_user_id, 'captain') returning * into team_member_row;
  elsif invite_row.invite_type = 'activity_member' then
    insert into public.memberships (activity_id, user_id, role, status, display_name)
    select invite_row.activity_id, p_user_id, invite_row.role, 'active', u.login_id from public.app_users u where u.id = p_user_id
    on conflict (activity_id, user_id) do update set status = 'active', updated_at = timezone('utc', now())
    returning * into joined;
  else
    select m.* into existing from public.memberships m where m.activity_id = invite_row.activity_id and m.user_id = p_user_id for update;
    if found then joined := existing; else insert into public.memberships (activity_id, user_id, role, status, display_name) select invite_row.activity_id, p_user_id, 'member', 'active', u.login_id from public.app_users u where u.id = p_user_id returning * into joined; end if;
    insert into public.team_memberships (team_id, user_id, role) values (invite_row.team_id, p_user_id, 'member') on conflict (team_id, user_id) do update set status = 'active', role = 'member', updated_at = timezone('utc', now()) returning * into team_member_row;
    team_row.id := invite_row.team_id;
  end if;
  if joined.id is null or (invite_row.invite_type <> 'activity_member' and team_row.id is null) then raise exception 'invite join could not create membership' using errcode = 'P0002'; end if;
  insert into public.activity_invite_uses (invite_id, user_id, membership_id, accepted_team_id) values (invite_row.id, p_user_id, joined.id, team_row.id);
  update public.activity_invites set use_count = use_count + 1 where id = invite_row.id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (invite_row.activity_id, p_user_id, 'membership.join', 'membership', joined.id, p_request_id, 'success');
  return query select joined.activity_id, joined.id, joined.role, false, team_row.id, invite_row.invite_type;
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
  elsif assigned_membership is not null and (exists (select 1 from public.tasks t where t.id = p_task_id and t.assignee_membership_id = assigned_membership) or exists (select 1 from public.task_assignees ta where ta.task_id = p_task_id and ta.membership_id = assigned_membership)) then
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

create or replace function public.formal_assign_task_members(p_user_id uuid, p_activity_id uuid, p_task_id uuid, p_membership_ids uuid[], p_request_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team_memberships tm join public.tasks x on x.team_id = tm.team_id where x.id = p_task_id and x.activity_id = p_activity_id and tm.user_id = p_user_id and tm.role = 'captain' and tm.status = 'active') then raise exception 'task assignment forbidden' using errcode = '42501'; end if;
  delete from public.task_assignees where task_id = p_task_id;
  insert into public.task_assignees (task_id, membership_id, assigned_by)
  select p_task_id, m.id, p_user_id from public.memberships m join public.tasks x on x.id = p_task_id join public.team_memberships tm on tm.user_id = m.user_id and tm.team_id = x.team_id and tm.status = 'active' where m.id = any(p_membership_ids) and m.activity_id = p_activity_id and m.status = 'active';
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'task.update', 'task', p_task_id, p_request_id, 'success');
end; $$;

revoke all on function public.formal_create_activity_invite_v2(uuid, uuid, text, uuid, text, text, text, timestamptz, integer, text) from public, anon, authenticated;
revoke all on function public.formal_join_activity_invite_v2(uuid, text, text) from public, anon, authenticated;
revoke all on function public.formal_assign_task_members(uuid, uuid, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.formal_create_activity_invite_v2(uuid, uuid, text, uuid, text, text, text, timestamptz, integer, text) to service_role;
grant execute on function public.formal_join_activity_invite_v2(uuid, text, text) to service_role;
grant execute on function public.formal_assign_task_members(uuid, uuid, uuid, uuid[], text) to service_role;
