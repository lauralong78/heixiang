-- HK-300: session revocation with an append-only logout audit event.
-- Apply this migration in Supabase SQL Editor after reviewing it.

create or replace function public.formal_revoke_session(
  p_token_digest text,
  p_request_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  session_user_id uuid;
begin
  update public.app_sessions
  set revoked_at = coalesce(revoked_at, timezone('utc', now())),
      last_seen_at = timezone('utc', now())
  where token_digest = p_token_digest
  returning user_id into session_user_id;

  if session_user_id is not null then
    insert into public.audit_events (actor_user_id, action, target_type, target_id, request_id, result)
    values (session_user_id, 'auth.logout', 'session', null, p_request_id, 'success');
  end if;
end;
$$;

revoke all on function public.formal_revoke_session(text, text) from public, anon, authenticated;
grant execute on function public.formal_revoke_session(text, text) to service_role;
