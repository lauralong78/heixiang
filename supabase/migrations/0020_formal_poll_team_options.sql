-- HK-313: make formal activity teams the authoritative voting options.
-- Team options are synchronized while a poll is draft and once, immediately
-- before it opens. Opening a poll still freezes the option set.

alter table public.poll_options
  add column if not exists team_id uuid references public.teams(id) on delete restrict;

create unique index if not exists poll_options_poll_team_uq
  on public.poll_options(poll_id, team_id)
  where team_id is not null;

create or replace function public.formal_sync_draft_poll_team_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('draft', 'open') then
    insert into public.poll_options(poll_id, team_id, title, description, link, submitted_by)
    select new.id, t.id, t.name, coalesce(t.description, ''), null, null
    from public.teams t
    where t.activity_id = new.activity_id
      and t.deleted_at is null
      and not exists (
        select 1 from public.poll_options existing
        where existing.poll_id = new.id and existing.team_id = t.id
      )
    on conflict (poll_id, team_id) where team_id is not null do update
      set title = excluded.title,
          description = excluded.description,
          updated_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists formal_poll_team_options_sync on public.polls;
create trigger formal_poll_team_options_sync
after insert or update of status on public.polls
for each row execute function public.formal_sync_draft_poll_team_options();

create or replace function public.formal_sync_team_options_for_draft_polls()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is null then
    insert into public.poll_options(poll_id, team_id, title, description, link, submitted_by)
    select p.id, new.id, new.name, coalesce(new.description, ''), null, null
    from public.polls p
    where p.activity_id = new.activity_id
      and p.status = 'draft'
    on conflict (poll_id, team_id) where team_id is not null do update
      set title = excluded.title,
          description = excluded.description,
          updated_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists formal_team_poll_options_sync on public.teams;
create trigger formal_team_poll_options_sync
after insert or update of name, description, deleted_at on public.teams
for each row execute function public.formal_sync_team_options_for_draft_polls();

create or replace function public.formal_list_activity_polls(p_user_id uuid, p_activity_id uuid)
returns setof public.polls
language sql security definer set search_path = public as $$
  select p.*
  from public.polls p
  join public.memberships m on m.activity_id = p.activity_id
    and m.user_id = p_user_id
    and m.status = 'active'
  where p.activity_id = p_activity_id
    and p.deleted_at is null
  order by case when p.status = 'open' then 0 when p.status = 'draft' then 1 else 2 end,
    p.updated_at desc;
$$;

revoke all on function public.formal_sync_draft_poll_team_options() from public, anon, authenticated;
revoke all on function public.formal_sync_team_options_for_draft_polls() from public, anon, authenticated;
revoke all on function public.formal_list_activity_polls(uuid, uuid) from public, anon, authenticated;
grant execute on function public.formal_sync_draft_poll_team_options() to service_role;
grant execute on function public.formal_sync_team_options_for_draft_polls() to service_role;
grant execute on function public.formal_list_activity_polls(uuid, uuid) to service_role;
