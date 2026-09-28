-- HK-301: transactional activity creation and accessible activity listing.
-- Apply this migration in Supabase SQL Editor after reviewing it.

create or replace function public.formal_create_activity(
  p_creator_id uuid,
  p_title text,
  p_description text,
  p_request_id text
)
returns table (id uuid, title text, description text, status text, data_version bigint, role text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_activity public.activities;
begin
  insert into public.activities (creator_id, title, description)
  values (p_creator_id, trim(p_title), coalesce(trim(p_description), ''))
  returning * into new_activity;

  insert into public.memberships (activity_id, user_id, role, display_name)
  select new_activity.id, p_creator_id, 'host', u.login_id
  from public.app_users u
  where u.id = p_creator_id and u.status = 'active';

  if not found then
    raise exception 'active creator not found';
  end if;

  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result)
  values (new_activity.id, p_creator_id, 'activity.create', 'activity', new_activity.id, p_request_id, 'success');

  return query select new_activity.id, new_activity.title, new_activity.description,
    new_activity.status, new_activity.data_version, 'host'::text, new_activity.updated_at;
end;
$$;

create or replace function public.formal_list_accessible_activities(p_user_id uuid)
returns table (id uuid, title text, description text, status text, data_version bigint, role text, updated_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select a.id, a.title, a.description, a.status, a.data_version, m.role, a.updated_at
  from public.memberships m
  join public.activities a on a.id = m.activity_id
  where m.user_id = p_user_id
    and m.status = 'active'
    and a.status <> 'deleted'
  order by a.updated_at desc;
$$;

revoke all on function public.formal_create_activity(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.formal_list_accessible_activities(uuid) from public, anon, authenticated;
grant execute on function public.formal_create_activity(uuid, text, text, text) to service_role;
grant execute on function public.formal_list_accessible_activities(uuid) to service_role;
