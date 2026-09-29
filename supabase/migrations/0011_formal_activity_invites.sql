-- HK-301: private activity invites with one-use-per-user idempotency.

create table if not exists public.activity_invites (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  token_digest text not null unique check (token_digest ~ '^[a-f0-9]{64}$'),
  token_hint text not null check (char_length(token_hint) between 6 and 16),
  role text not null default 'collaborator' check (role in ('member', 'collaborator')),
  created_by uuid not null references public.app_users(id) on delete restrict,
  expires_at timestamptz,
  max_uses integer not null default 50 check (max_uses between 1 and 500),
  use_count integer not null default 0 check (use_count >= 0),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);

create index if not exists activity_invites_activity_status_idx on public.activity_invites(activity_id, status, created_at desc);

create table if not exists public.activity_invite_uses (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.activity_invites(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete restrict,
  membership_id uuid not null references public.memberships(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  unique (invite_id, user_id)
);

alter table public.activity_invites enable row level security;
alter table public.activity_invite_uses enable row level security;

create or replace function public.formal_create_activity_invite(
  p_user_id uuid, p_activity_id uuid, p_token_digest text, p_token_hint text,
  p_role text, p_expires_at timestamptz, p_max_uses integer, p_request_id text
)
returns table (id uuid, activity_id uuid, token_hint text, role text, expires_at timestamptz, max_uses integer, use_count integer, status text)
language plpgsql security definer set search_path = public as $$
declare created public.activity_invites;
begin
  if p_role not in ('member', 'collaborator') then raise exception 'invite role invalid' using errcode = '22023'; end if;
  if not exists (select 1 from public.memberships m where m.activity_id = p_activity_id and m.user_id = p_user_id and m.role = 'host' and m.status = 'active') then
    raise exception 'invite create forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.activities a where a.id = p_activity_id and a.status not in ('deleted', 'archived')) then
    raise exception 'activity not found' using errcode = 'P0002';
  end if;
  insert into public.activity_invites (activity_id, token_digest, token_hint, role, created_by, expires_at, max_uses)
  values (p_activity_id, p_token_digest, p_token_hint, p_role, p_user_id, p_expires_at, coalesce(p_max_uses, 50))
  returning * into created;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result)
  values (p_activity_id, p_user_id, 'membership.invite', 'activity_invite', created.id, p_request_id, 'success');
  return query select created.id, created.activity_id, created.token_hint, created.role, created.expires_at, created.max_uses, created.use_count, created.status;
end; $$;

create or replace function public.formal_join_activity_invite(
  p_user_id uuid, p_token_digest text, p_request_id text
)
returns table (activity_id uuid, membership_id uuid, role text, already_joined boolean)
language plpgsql security definer set search_path = public as $$
declare invite_row public.activity_invites; existing public.memberships; joined public.memberships; used_before boolean;
begin
  select i.* into invite_row from public.activity_invites i where i.token_digest = p_token_digest for update;
  select m.* into existing from public.memberships m where m.activity_id = invite_row.activity_id and m.user_id = p_user_id for update;
  if found and existing.status = 'active' then
    return query select existing.activity_id, existing.id, existing.role, true;
    return;
  end if;
  if not found or invite_row.status <> 'active' or (invite_row.expires_at is not null and invite_row.expires_at <= timezone('utc', now())) or invite_row.use_count >= invite_row.max_uses then
    raise exception 'invite invalid' using errcode = '22023';
  end if;
  if found then
    update public.memberships set status = 'active', role = invite_row.role, left_at = null, updated_at = timezone('utc', now()) where id = existing.id returning * into joined;
  else
    insert into public.memberships (activity_id, user_id, role, status, display_name)
    select invite_row.activity_id, p_user_id, invite_row.role, 'active', u.login_id from public.app_users u where u.id = p_user_id returning * into joined;
  end if;
  if joined.id is null then raise exception 'user not found' using errcode = 'P0002'; end if;
  select exists (select 1 from public.activity_invite_uses iu where iu.invite_id = invite_row.id and iu.user_id = p_user_id) into used_before;
  if not used_before then
    insert into public.activity_invite_uses (invite_id, user_id, membership_id) values (invite_row.id, p_user_id, joined.id);
    update public.activity_invites set use_count = use_count + 1 where id = invite_row.id;
  end if;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result)
  values (invite_row.activity_id, p_user_id, 'membership.join', 'membership', joined.id, p_request_id, 'success');
  return query select joined.activity_id, joined.id, joined.role, false;
end; $$;

create or replace function public.formal_revoke_activity_invite(p_user_id uuid, p_invite_id uuid, p_request_id text)
returns void language plpgsql security definer set search_path = public as $$
declare changed public.activity_invites;
begin
  update public.activity_invites i set status = 'revoked', revoked_at = timezone('utc', now())
  where i.id = p_invite_id and i.status = 'active' and exists (select 1 from public.memberships m where m.activity_id = i.activity_id and m.user_id = p_user_id and m.role = 'host' and m.status = 'active')
  returning i.* into changed;
  if not found then raise exception 'invite revoke forbidden' using errcode = '42501'; end if;
  insert into public.audit_events (activity_id, actor_user_id, action, target_type, target_id, request_id, result)
  values (changed.activity_id, p_user_id, 'membership.invite.revoke', 'activity_invite', changed.id, p_request_id, 'success');
end; $$;

revoke all on function public.formal_create_activity_invite(uuid, uuid, text, text, text, timestamptz, integer, text) from public, anon, authenticated;
revoke all on function public.formal_join_activity_invite(uuid, text, text) from public, anon, authenticated;
revoke all on function public.formal_revoke_activity_invite(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.formal_create_activity_invite(uuid, uuid, text, text, text, timestamptz, integer, text) to service_role;
grant execute on function public.formal_join_activity_invite(uuid, text, text) to service_role;
grant execute on function public.formal_revoke_activity_invite(uuid, uuid, text) to service_role;
