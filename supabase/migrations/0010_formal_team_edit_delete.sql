-- HK-301: team edits and audited soft deletion.

alter table public.teams add column if not exists data_version bigint not null default 1;

create or replace function public.formal_list_activity_teams_v2(p_user_id uuid, p_activity_id uuid)
returns table (id uuid, name text, description text, task_count bigint, sort_order integer, data_version bigint)
language sql security definer set search_path = public as $$
  select t.id, t.name, t.description, (select count(*) from public.tasks x where x.team_id = t.id and x.deleted_at is null), t.sort_order, t.data_version
  from public.teams t where t.activity_id = p_activity_id and t.deleted_at is null
    and exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active')
  order by t.sort_order, t.created_at;
$$;

create or replace function public.formal_update_team(
  p_user_id uuid, p_activity_id uuid, p_team_id uuid, p_name text, p_description text, p_expected_version bigint, p_request_id text
)
returns table (id uuid, name text, description text, task_count bigint, sort_order integer, data_version bigint)
language plpgsql security definer set search_path = public as $$
declare changed public.teams;
begin
  if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active' and m.role in ('collaborator', 'host')) then raise exception 'team write forbidden' using errcode = '42501'; end if;
  update public.teams as t set name = trim(p_name), normalized_name = lower(trim(p_name)), description = coalesce(trim(p_description), ''), data_version = t.data_version + 1, updated_at = timezone('utc', now())
    where t.id = p_team_id and t.activity_id = p_activity_id and t.deleted_at is null and t.data_version = p_expected_version returning t.* into changed;
  if not found then raise exception 'team version conflict' using errcode = '40001'; end if;
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'team.update', 'team', changed.id, p_request_id, 'success');
  return query select changed.id, changed.name, changed.description, (select count(*) from public.tasks x where x.team_id = changed.id and x.deleted_at is null), changed.sort_order, changed.data_version;
end; $$;

create or replace function public.formal_delete_team(p_user_id uuid, p_activity_id uuid, p_team_id uuid, p_expected_version bigint, p_request_id text)
returns void language plpgsql security definer set search_path = public as $$
declare changed public.teams;
begin
  if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active' and m.role = 'host') then raise exception 'team delete forbidden' using errcode = '42501'; end if;
  update public.teams as t set deleted_at = timezone('utc', now()), data_version = t.data_version + 1, updated_at = timezone('utc', now()) where t.id = p_team_id and t.activity_id = p_activity_id and t.deleted_at is null and t.data_version = p_expected_version returning t.* into changed;
  if not found then raise exception 'team version conflict' using errcode = '40001'; end if;
  update public.activities as a set data_version = a.data_version + 1, updated_at = timezone('utc', now()) where a.id = p_activity_id;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result) values (p_activity_id, p_user_id, 'team.delete', 'team', changed.id, p_request_id, 'success');
end; $$;

revoke all on function public.formal_update_team(uuid, uuid, uuid, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.formal_delete_team(uuid, uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.formal_list_activity_teams_v2(uuid, uuid) from public, anon, authenticated;
grant execute on function public.formal_update_team(uuid, uuid, uuid, text, text, bigint, text) to service_role;
grant execute on function public.formal_delete_team(uuid, uuid, uuid, bigint, text) to service_role;
grant execute on function public.formal_list_activity_teams_v2(uuid, uuid) to service_role;
