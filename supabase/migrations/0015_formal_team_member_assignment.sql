-- HK-301: list team members and persist one-or-many task assignees.

create or replace function public.formal_list_team_members(p_user_id uuid, p_activity_id uuid, p_team_id uuid)
returns table (membership_id uuid, user_id uuid, display_name text, role text)
language sql security definer set search_path = public as $$
  select m.id, m.user_id, m.display_name, tm.role
  from public.team_memberships tm
  join public.memberships m on m.user_id = tm.user_id and m.activity_id = p_activity_id and m.status = 'active'
  where tm.team_id = p_team_id and tm.status = 'active'
    and exists (select 1 from public.memberships viewer where viewer.activity_id = p_activity_id and viewer.user_id = p_user_id and viewer.status = 'active')
  order by case when tm.role = 'captain' then 0 else 1 end, m.display_name;
$$;

create or replace function public.formal_list_task_assignees(p_user_id uuid, p_activity_id uuid, p_team_id uuid, p_task_id uuid)
returns table (membership_id uuid)
language sql security definer set search_path = public as $$
  select ta.membership_id
  from public.task_assignees ta
  join public.tasks t on t.id = ta.task_id and t.team_id = p_team_id and t.activity_id = p_activity_id and t.deleted_at is null
  where ta.task_id = p_task_id
    and exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.status = 'active');
$$;

revoke all on function public.formal_list_team_members(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.formal_list_task_assignees(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.formal_list_team_members(uuid, uuid, uuid) to service_role;
grant execute on function public.formal_list_task_assignees(uuid, uuid, uuid, uuid) to service_role;
