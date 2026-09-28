-- HK-301: persist an optional activity deadline when creating an activity.

create or replace function public.formal_create_activity_v2(
  p_creator_id uuid, p_title text, p_description text, p_deadline_at timestamptz, p_request_id text
)
returns table (id uuid, title text, description text, deadline_at timestamptz, status text, data_version bigint, role text, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare created public.activities;
begin
  insert into public.activities (title, description, deadline_at, created_by)
  values (trim(p_title), coalesce(trim(p_description), ''), p_deadline_at, p_creator_id)
  returning * into created;
  insert into public.memberships (activity_id, user_id, role, status) values (created.id, p_creator_id, 'host', 'active');
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result)
  values (created.id, p_creator_id, 'activity.create', 'activity', created.id, p_request_id, 'success');
  return query select created.id, created.title, created.description, created.deadline_at, created.status, created.data_version, 'host'::text, created.updated_at;
end; $$;

revoke all on function public.formal_create_activity_v2(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.formal_create_activity_v2(uuid, text, text, timestamptz, text) to service_role;
