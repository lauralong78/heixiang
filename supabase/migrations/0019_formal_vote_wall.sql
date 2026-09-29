-- HK-310: server-owned single-choice vote wall. Review only; this file is not applied by this task.

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  choice_mode text not null default 'single-choice' check (choice_mode = 'single-choice'),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  result_mode text not null default 'hidden' check (result_mode in ('hidden', 'live', 'final')),
  host_eligible boolean not null default false,
  allow_self_vote boolean not null default false,
  data_version bigint not null default 1 check (data_version > 0),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz,
  deleted_at timestamptz
);
create index if not exists polls_activity_status_idx on public.polls(activity_id, status, updated_at desc);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  link text check (link is null or (char_length(link) <= 2048 and link ~ '^https://[^[:space:]]+$')),
  submitted_by uuid references public.app_users(id) on delete set null,
  status text not null default 'published' check (status in ('published', 'withdrawn', 'removed')),
  data_version bigint not null default 1 check (data_version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index if not exists poll_options_poll_status_idx on public.poll_options(poll_id, status, created_at);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete restrict,
  voter_user_id uuid not null references public.app_users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'voided')),
  cast_at timestamptz not null default timezone('utc', now()),
  voided_at timestamptz,
  voided_by uuid references public.app_users(id) on delete set null,
  void_reason text check (void_reason is null or char_length(void_reason) between 1 and 500),
  check ((status = 'active' and voided_at is null and void_reason is null) or (status = 'voided' and voided_at is not null and void_reason is not null))
);
create unique index if not exists votes_poll_voter_uq on public.votes(poll_id, voter_user_id);
create index if not exists votes_poll_option_status_idx on public.votes(poll_id, option_id, status);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.votes enable row level security;

create or replace function public.formal_poll_snapshot_json(p_user_id uuid, p_poll_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.polls; member_ok boolean; visible boolean; result jsonb;
begin
  select x.* into p from public.polls x join public.memberships m on m.activity_id = x.activity_id and m.user_id = p_user_id and m.status = 'active' where x.id = p_poll_id and x.deleted_at is null;
  if not found then raise exception 'poll not found or forbidden' using errcode = '42501'; end if;
  member_ok := exists(select 1 from public.memberships m where m.activity_id = p.activity_id and m.user_id = p_user_id and m.status = 'active');
  visible := p.result_mode = 'live' or (p.result_mode = 'final' and p.status = 'closed');
  select coalesce(jsonb_agg(jsonb_build_object('optionId', o.id, 'count', case when visible then (select count(*) from public.votes v where v.poll_id = p.id and v.option_id = o.id and v.status = 'active') else null end, 'recordedForViewer', exists(select 1 from public.votes v where v.poll_id = p.id and v.option_id = o.id and v.voter_user_id = p_user_id)) order by o.created_at), '[]'::jsonb) into result from public.poll_options o where o.poll_id = p.id;
  return jsonb_build_object('poll', to_jsonb(p), 'options', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from public.poll_options o where o.poll_id = p.id), '[]'::jsonb), 'results', result, 'viewerVote', (select jsonb_build_object('voteId', v.id, 'optionId', v.option_id, 'status', v.status) from public.votes v where v.poll_id = p.id and v.voter_user_id = p_user_id));
end; $$;

create or replace function public.formal_get_poll_snapshot(p_user_id uuid, p_poll_id uuid)
returns jsonb language sql security definer set search_path = public as $$ select public.formal_poll_snapshot_json(p_user_id, p_poll_id); $$;
create or replace function public.formal_get_poll_result(p_user_id uuid, p_poll_id uuid)
returns jsonb language sql security definer set search_path = public as $$ select public.formal_poll_snapshot_json(p_user_id, p_poll_id); $$;

create or replace function public.formal_create_poll(p_user_id uuid, p_activity_id uuid, p_title text, p_description text, p_host_eligible boolean, p_allow_self_vote boolean, p_result_mode text, p_operation_id text, p_request_id text)
returns table (id uuid, activity_id uuid, title text, description text, choice_mode text, status text, result_mode text, host_eligible boolean, allow_self_vote boolean, data_version bigint, created_by uuid, created_at timestamptz, updated_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare p public.polls; prior public.idempotency_records; fp text;
begin
  fp := md5(jsonb_build_object('activityId',p_activity_id,'title',trim(p_title),'description',coalesce(trim(p_description),''),'hostEligible',p_host_eligible,'allowSelfVote',p_allow_self_vote,'resultMode',p_result_mode)::text);
  select * into prior from public.idempotency_records where actor_user_id=p_user_id and activity_id=p_activity_id and action='poll.create' and operation_id=p_operation_id for update;
  if found then if prior.request_fingerprint <> fp then raise exception 'idempotency key reused' using errcode='23505'; end if; select * into p from jsonb_populate_record(null::public.polls, prior.response_json); return query select p.id,p.activity_id,p.title,p.description,p.choice_mode,p.status,p.result_mode,p.host_eligible,p.allow_self_vote,p.data_version,p.created_by,p.created_at,p.updated_at,p.closed_at; return; end if;
  if not exists(select 1 from public.memberships m join public.activities a on a.id=m.activity_id where m.activity_id=p_activity_id and m.user_id=p_user_id and m.role='host' and m.status='active' and a.status not in ('closed','archived','deleted')) then raise exception 'poll create forbidden' using errcode='42501'; end if;
  insert into public.polls(activity_id,title,description,host_eligible,allow_self_vote,result_mode,created_by) values(p_activity_id,trim(p_title),coalesce(trim(p_description),''),p_host_eligible,p_allow_self_vote,p_result_mode,p_user_id) returning * into p;
  insert into public.audit_events(activity_id,actor_user_id,action,target_type,target_id,request_id,result) values(p_activity_id,p_user_id,'poll.create','poll',p.id,p_request_id,'success');
  insert into public.idempotency_records(actor_user_id,activity_id,action,operation_id,request_fingerprint,response_json) values(p_user_id,p_activity_id,'poll.create',p_operation_id,fp,to_jsonb(p));
  return query select p.id,p.activity_id,p.title,p.description,p.choice_mode,p.status,p.result_mode,p.host_eligible,p.allow_self_vote,p.data_version,p.created_by,p.created_at,p.updated_at,p.closed_at;
end; $$;

create or replace function public.formal_create_poll_option(p_user_id uuid, p_poll_id uuid, p_title text, p_description text, p_link text, p_submitted_by uuid, p_operation_id text, p_request_id text)
returns table (id uuid, poll_id uuid, title text, description text, link text, submitted_by uuid, status text, data_version bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare o public.poll_options; p public.polls; fp text; prior public.idempotency_records;
begin
  select x.* into p from public.polls x join public.memberships m on m.activity_id=x.activity_id and m.user_id=p_user_id and m.role='host' and m.status='active' where x.id=p_poll_id for update;
  if not found then raise exception 'poll option create forbidden' using errcode='42501'; end if;
  fp:=md5(jsonb_build_object('pollId',p_poll_id,'title',trim(p_title),'description',coalesce(trim(p_description),''),'link',p_link,'submittedBy',p_submitted_by)::text);
  select * into prior from public.idempotency_records where actor_user_id=p_user_id and activity_id=p.activity_id and action='poll.option.create' and operation_id=p_operation_id for update;
  if found then if prior.request_fingerprint<>fp then raise exception 'idempotency key reused' using errcode='23505'; end if; return query select * from jsonb_populate_record(null::public.poll_options,prior.response_json); return; end if;
  if p.status <> 'draft' then raise exception 'poll options locked' using errcode='55000'; end if;
  if p_submitted_by is not null and not exists(select 1 from public.memberships m where m.activity_id=p.activity_id and m.user_id=p_submitted_by and m.status='active') then raise exception 'submitted by is not an active member' using errcode='23503'; end if;
  insert into public.poll_options(poll_id,title,description,link,submitted_by) values(p_poll_id,trim(p_title),coalesce(trim(p_description),''),p_link,p_submitted_by) returning * into o;
  update public.polls set data_version=data_version+1,updated_at=timezone('utc',now()) where id=p_poll_id;
  insert into public.audit_events(activity_id,actor_user_id,action,target_type,target_id,request_id,result) values(p.activity_id,p_user_id,'poll.option.create','poll_option',o.id,p_request_id,'success');
  insert into public.idempotency_records(actor_user_id,activity_id,action,operation_id,request_fingerprint,response_json) values(p_user_id,p.activity_id,'poll.option.create',p_operation_id,fp,to_jsonb(o));
  return query select o.id,o.poll_id,o.title,o.description,o.link,o.submitted_by,o.status,o.data_version,o.created_at,o.updated_at;
end; $$;

create or replace function public.formal_update_poll(p_user_id uuid, p_poll_id uuid, p_title text, p_description text, p_host_eligible boolean, p_allow_self_vote boolean, p_result_mode text, p_open boolean, p_close boolean, p_expected_version bigint, p_operation_id text, p_request_id text)
returns table (id uuid, activity_id uuid, title text, description text, choice_mode text, status text, result_mode text, host_eligible boolean, allow_self_vote boolean, data_version bigint, created_by uuid, created_at timestamptz, updated_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare p public.polls; fp text; prior public.idempotency_records; action_name text;
begin
  select x.* into p from public.polls x join public.memberships m on m.activity_id=x.activity_id and m.user_id=p_user_id and m.role='host' and m.status='active' where x.id=p_poll_id for update;
  if not found then raise exception 'poll update forbidden' using errcode='42501'; end if;
  action_name:=case when p_close then 'poll.close' else 'poll.update' end;
  fp:=md5(jsonb_build_object('pollId',p_poll_id,'title',p_title,'description',p_description,'hostEligible',p_host_eligible,'allowSelfVote',p_allow_self_vote,'resultMode',p_result_mode,'open',p_open,'close',p_close,'version',p_expected_version)::text);
  select * into prior from public.idempotency_records where actor_user_id=p_user_id and activity_id=p.activity_id and action=action_name and operation_id=p_operation_id for update;
  if found then if prior.request_fingerprint<>fp then raise exception 'idempotency key reused' using errcode='23505'; end if; select * into p from jsonb_populate_record(null::public.polls,prior.response_json); return query select p.id,p.activity_id,p.title,p.description,p.choice_mode,p.status,p.result_mode,p.host_eligible,p.allow_self_vote,p.data_version,p.created_by,p.created_at,p.updated_at,p.closed_at; return; end if;
  if p.data_version<>p_expected_version then raise exception 'poll version conflict' using errcode='40001'; end if;
  if p_close then if p.status<>'open' then raise exception 'poll is not open' using errcode='55000'; end if; update public.polls set status='closed',closed_at=timezone('utc',now()),updated_at=timezone('utc',now()),data_version=data_version+1 where id=p.id returning * into p;
  elsif p_open then if p.status<>'draft' then raise exception 'poll is not draft' using errcode='55000'; end if; if exists(select 1 from public.activities a where a.id=p.activity_id and a.status<>'open') then raise exception 'activity is not open' using errcode='55000'; end if; update public.polls set status='open',updated_at=timezone('utc',now()),data_version=data_version+1 where id=p.id returning * into p;
  else if p.status<>'draft' then raise exception 'poll rules locked' using errcode='55000'; end if; update public.polls set title=coalesce(trim(p_title),title),description=coalesce(trim(p_description),description),host_eligible=coalesce(p_host_eligible,host_eligible),allow_self_vote=coalesce(p_allow_self_vote,allow_self_vote),result_mode=coalesce(p_result_mode,result_mode),updated_at=timezone('utc',now()),data_version=data_version+1 where id=p.id returning * into p; end if;
  insert into public.audit_events(activity_id,actor_user_id,action,target_type,target_id,request_id,result) values(p.activity_id,p_user_id,action_name,'poll',p.id,p_request_id,'success');
  insert into public.idempotency_records(actor_user_id,activity_id,action,operation_id,request_fingerprint,response_json) values(p_user_id,p.activity_id,action_name,p_operation_id,fp,to_jsonb(p));
  return query select p.id,p.activity_id,p.title,p.description,p.choice_mode,p.status,p.result_mode,p.host_eligible,p.allow_self_vote,p.data_version,p.created_by,p.created_at,p.updated_at,p.closed_at;
end; $$;

create or replace function public.formal_update_poll_option(p_user_id uuid, p_poll_id uuid, p_option_id uuid, p_title text, p_description text, p_link text, p_submitted_by uuid, p_status text, p_expected_version bigint, p_operation_id text, p_request_id text)
returns table (id uuid, poll_id uuid, title text, description text, link text, submitted_by uuid, status text, data_version bigint, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare o public.poll_options; p public.polls; fp text; prior public.idempotency_records;
begin
  select x.* into p from public.polls x join public.memberships m on m.activity_id=x.activity_id and m.user_id=p_user_id and m.role='host' and m.status='active' where x.id=p_poll_id for update;
  if not found then raise exception 'poll option update forbidden' using errcode='42501'; end if;
  select x.* into o from public.poll_options x where x.id=p_option_id and x.poll_id=p_poll_id for update;
  if not found then raise exception 'poll option not found' using errcode='P0002'; end if;
  fp:=md5(jsonb_build_object('pollId',p_poll_id,'optionId',p_option_id,'title',p_title,'description',p_description,'link',p_link,'submittedBy',p_submitted_by,'status',p_status,'version',p_expected_version)::text);
  select * into prior from public.idempotency_records where actor_user_id=p_user_id and activity_id=p.activity_id and action='poll.option.update' and operation_id=p_operation_id for update;
  if found then if prior.request_fingerprint<>fp then raise exception 'idempotency key reused' using errcode='23505'; end if; return query select * from jsonb_populate_record(null::public.poll_options,prior.response_json); return; end if;
  if p.status<>'draft' or p.status<>p.status then raise exception 'poll options locked' using errcode='55000'; end if;
  if o.data_version<>p_expected_version then raise exception 'poll option version conflict' using errcode='40001'; end if;
  if p_submitted_by is not null and not exists(select 1 from public.memberships m where m.activity_id=p.activity_id and m.user_id=p_submitted_by and m.status='active') then raise exception 'submitted by is not an active member' using errcode='23503'; end if;
  update public.poll_options set title=trim(p_title),description=coalesce(trim(p_description),''),link=p_link,submitted_by=p_submitted_by,status=p_status,data_version=data_version+1,updated_at=timezone('utc',now()) where id=o.id returning * into o;
  update public.polls set data_version=data_version+1,updated_at=timezone('utc',now()) where id=p.id;
  insert into public.audit_events(activity_id,actor_user_id,action,target_type,target_id,request_id,result) values(p.activity_id,p_user_id,'poll.option.update','poll_option',o.id,p_request_id,'success');
  insert into public.idempotency_records(actor_user_id,activity_id,action,operation_id,request_fingerprint,response_json) values(p_user_id,p.activity_id,'poll.option.update',p_operation_id,fp,to_jsonb(o));
  return query select o.id,o.poll_id,o.title,o.description,o.link,o.submitted_by,o.status,o.data_version,o.created_at,o.updated_at;
end; $$;

create or replace function public.formal_cast_vote(p_user_id uuid, p_poll_id uuid, p_option_id uuid, p_operation_id text, p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.polls; o public.poll_options; v public.votes; prior public.idempotency_records; fp text; result jsonb;
begin
  select x.* into p from public.polls x join public.memberships m on m.activity_id=x.activity_id and m.user_id=p_user_id and m.status='active' where x.id=p_poll_id for update;
  if not found then raise exception 'vote forbidden' using errcode='42501'; end if;
  select x.* into o from public.poll_options x where x.id=p_option_id and x.poll_id=p_poll_id and x.status='published';
  if not found then raise exception 'poll option unavailable' using errcode='P0002'; end if;
  fp:=md5(jsonb_build_object('pollId',p_poll_id,'optionId',p_option_id)::text);
  select * into prior from public.idempotency_records where actor_user_id=p_user_id and activity_id=p.activity_id and action='vote.cast' and operation_id=p_operation_id for update;
  if found then if prior.request_fingerprint<>fp then raise exception 'idempotency key reused' using errcode='23505'; end if; return prior.response_json; end if;
  if p.status<>'open' then raise exception 'poll is not open' using errcode='55000'; end if;
  if not exists(select 1 from public.activities a where a.id=p.activity_id and a.status='open') then raise exception 'activity is not open' using errcode='55000'; end if;
  if exists(select 1 from public.memberships m where m.activity_id=p.activity_id and m.user_id=p_user_id and m.role='host' and not p.host_eligible) then raise exception 'host is not eligible' using errcode='42501'; end if;
  if not p.allow_self_vote and o.submitted_by=p_user_id then raise exception 'self vote is not allowed' using errcode='42501'; end if;
  select x.* into v from public.votes x where x.poll_id=p.id and x.voter_user_id=p_user_id;
  if found then result:=jsonb_build_object('code','ALREADY_VOTED','vote',to_jsonb(v),'message','每位成员每个投票只能投一票。');
  else insert into public.votes(poll_id,option_id,voter_user_id) values(p.id,o.id,p_user_id) returning * into v; result:=jsonb_build_object('code','RECORDED','vote',to_jsonb(v),'message','投票已记录。'); insert into public.audit_events(activity_id,actor_user_id,action,target_type,target_id,request_id,result) values(p.activity_id,p_user_id,'vote.cast','vote',v.id,p_request_id,'success'); end if;
  insert into public.idempotency_records(actor_user_id,activity_id,action,operation_id,request_fingerprint,response_json) values(p_user_id,p.activity_id,'vote.cast',p_operation_id,fp,result);
  return result;
end; $$;

create or replace function public.formal_void_vote(p_user_id uuid, p_poll_id uuid, p_vote_id uuid, p_reason text, p_operation_id text, p_request_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.polls; v public.votes; prior public.idempotency_records; fp text; result jsonb;
begin
  select x.* into p from public.polls x join public.memberships m on m.activity_id=x.activity_id and m.user_id=p_user_id and m.role='host' and m.status='active' where x.id=p_poll_id for update;
  if not found then raise exception 'vote void forbidden' using errcode='42501'; end if;
  select x.* into v from public.votes x where x.id=p_vote_id and x.poll_id=p_poll_id for update;
  if not found then raise exception 'vote not found' using errcode='P0002'; end if;
  fp:=md5(jsonb_build_object('pollId',p_poll_id,'voteId',p_vote_id,'reason',trim(p_reason))::text);
  select * into prior from public.idempotency_records where actor_user_id=p_user_id and activity_id=p.activity_id and action='vote.void' and operation_id=p_operation_id for update;
  if found then if prior.request_fingerprint<>fp then raise exception 'idempotency key reused' using errcode='23505'; end if; return prior.response_json; end if;
  if p.status='closed' or v.status='voided' then raise exception 'vote is frozen' using errcode='55000'; end if;
  update public.votes set status='voided',voided_at=timezone('utc',now()),voided_by=p_user_id,void_reason=trim(p_reason) where id=v.id returning * into v;
  result:=jsonb_build_object('voided',true,'vote',to_jsonb(v));
  insert into public.audit_events(activity_id,actor_user_id,action,target_type,target_id,request_id,result,metadata_json) values(p.activity_id,p_user_id,'vote.void','vote',v.id,p_request_id,'success',jsonb_build_object('reason',trim(p_reason)));
  insert into public.idempotency_records(actor_user_id,activity_id,action,operation_id,request_fingerprint,response_json) values(p_user_id,p.activity_id,'vote.void',p_operation_id,fp,result);
  return result;
end; $$;

revoke all on function public.formal_poll_snapshot_json(uuid,uuid) from public,anon,authenticated;
revoke all on function public.formal_get_poll_snapshot(uuid,uuid) from public,anon,authenticated;
revoke all on function public.formal_get_poll_result(uuid,uuid) from public,anon,authenticated;
revoke all on function public.formal_create_poll(uuid,uuid,text,text,boolean,boolean,text,text,text) from public,anon,authenticated;
revoke all on function public.formal_create_poll_option(uuid,uuid,text,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.formal_update_poll(uuid,uuid,text,text,boolean,boolean,text,boolean,boolean,bigint,text,text) from public,anon,authenticated;
revoke all on function public.formal_update_poll_option(uuid,uuid,uuid,text,text,text,uuid,text,bigint,text,text) from public,anon,authenticated;
revoke all on function public.formal_cast_vote(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.formal_void_vote(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.formal_poll_snapshot_json(uuid,uuid) to service_role;
grant execute on function public.formal_get_poll_snapshot(uuid,uuid) to service_role;
grant execute on function public.formal_get_poll_result(uuid,uuid) to service_role;
grant execute on function public.formal_create_poll(uuid,uuid,text,text,boolean,boolean,text,text,text) to service_role;
grant execute on function public.formal_create_poll_option(uuid,uuid,text,text,text,uuid,text,text) to service_role;
grant execute on function public.formal_update_poll(uuid,uuid,text,text,boolean,boolean,text,boolean,boolean,bigint,text,text) to service_role;
grant execute on function public.formal_update_poll_option(uuid,uuid,uuid,text,text,text,uuid,text,bigint,text,text) to service_role;
grant execute on function public.formal_cast_vote(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.formal_void_vote(uuid,uuid,uuid,text,text,text) to service_role;
