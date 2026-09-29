-- Repair migration: disambiguate PL/pgSQL output columns from table columns
-- while accepting activity-team and team-member invitations.

create or replace function public.formal_join_activity_invite_v2(p_user_id uuid, p_token_digest text, p_request_id text)
returns table (activity_id uuid, membership_id uuid, role text, already_joined boolean, team_id uuid, invite_type text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
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

revoke all on function public.formal_join_activity_invite_v2(uuid, text, text) from public, anon, authenticated;
grant execute on function public.formal_join_activity_invite_v2(uuid, text, text) to service_role;
