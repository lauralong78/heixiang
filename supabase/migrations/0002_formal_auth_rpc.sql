-- HK-300: transactional self-managed ID/password auth primitives.
-- Apply this migration in Supabase SQL Editor after reviewing it.

create or replace function public.formal_register_user(
  p_login_id text,
  p_password_hash text,
  p_request_id text
)
returns table (id uuid, login_id text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_user public.app_users;
begin
  insert into public.app_users (login_id, password_hash)
  values (trim(p_login_id), p_password_hash)
  returning * into new_user;

  insert into public.audit_events (actor_user_id, action, target_type, target_id, request_id, result)
  values (new_user.id, 'auth.register', 'user', new_user.id, p_request_id, 'success');

  return query select new_user.id, new_user.login_id, new_user.status, new_user.created_at;
end;
$$;

create or replace function public.formal_create_session(
  p_user_id uuid,
  p_token_digest text,
  p_expires_at timestamptz,
  p_request_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_sessions (user_id, token_digest, expires_at)
  values (p_user_id, p_token_digest, p_expires_at);

  insert into public.audit_events (actor_user_id, action, target_type, target_id, request_id, result)
  values (p_user_id, 'auth.login', 'user', p_user_id, p_request_id, 'success');
end;
$$;

create or replace function public.formal_record_auth_failure(
  p_action text,
  p_request_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action not in ('auth.login', 'auth.register') then
    raise exception 'invalid auth audit action';
  end if;

  insert into public.audit_events (action, target_type, request_id, result)
  values (p_action, 'user', p_request_id, 'failure');
end;
$$;

revoke all on function public.formal_register_user(text, text, text) from public, anon, authenticated;
revoke all on function public.formal_create_session(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.formal_record_auth_failure(text, text) from public, anon, authenticated;
grant execute on function public.formal_register_user(text, text, text) to service_role;
grant execute on function public.formal_create_session(uuid, text, timestamptz, text) to service_role;
grant execute on function public.formal_record_auth_failure(text, text) to service_role;
