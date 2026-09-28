-- HK-301: team listing and creation for active activity members.
-- Apply this migration in Supabase SQL Editor after reviewing it.

create or replace function public.formal_list_activity_teams(
  p_user_id uuid,
  p_activity_id uuid
)
returns table (id uuid, name text, description text, task_count bigint, sort_order integer)
language sql
security definer
set search_path = public
as $$
  select t.id, t.name, t.description,
    (select count(*) from public.tasks x where x.team_id = t.id and x.deleted_at is null),
    t.sort_order
  from public.teams t
  where t.activity_id = p_activity_id
    and t.deleted_at is null
    and exists (
      select 1 from public.memberships m
      where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active'
    )
  order by t.sort_order, t.created_at;
$$;

create or replace function public.formal_create_team(
  p_user_id uuid,
  p_activity_id uuid,
  p_name text,
  p_description text,
  p_request_id text
)
returns table (id uuid, name text, description text, task_count bigint, sort_order integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_team public.teams;
begin
  if not exists (
    select 1 from public.memberships m
    where m.activity_id = p_activity_id and m.user_id = p_user_id
      and m.status = 'active' and m.role in ('collaborator', 'host')
  ) then
    raise exception 'team write forbidden' using errcode = '42501';
  end if;

  insert into public.teams (activity_id, name, normalized_name, description, created_by)
  values (p_activity_id, trim(p_name), lower(trim(p_name)), coalesce(trim(p_description), ''), p_user_id)
  returning * into new_team;

  update public.activities set data_version = data_version + 1, updated_at = timezone('utc', now())
  where public.activities.id = p_activity_id;

  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result)
  values (p_activity_id, p_user_id, 'team.create', 'team', new_team.id, p_request_id, 'success');

  return query select new_team.id, new_team.name, new_team.description, 0::bigint, new_team.sort_order;
end;
$$;

revoke all on function public.formal_list_activity_teams(uuid, uuid) from public, anon, authenticated;
revoke all on function public.formal_create_team(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.formal_list_activity_teams(uuid, uuid) to service_role;
grant execute on function public.formal_create_team(uuid, uuid, text, text, text) to service_role;
