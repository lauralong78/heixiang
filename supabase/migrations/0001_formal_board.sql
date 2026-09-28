-- HK-300: formal progress board foundation.
-- This migration is a reviewable draft. It is not applied to a Supabase project by this repository.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  login_id text not null,
  login_id_normalized text generated always as (lower(trim(login_id))) stored,
  password_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled', 'pending_delete')),
  contact_value_encrypted text,
  contact_visibility text not null default 'private' check (contact_visibility in ('private', 'activity_members')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_login_at timestamptz
);

create unique index if not exists app_users_login_id_normalized_uq on public.app_users(login_id_normalized);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_digest text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  ip_hash text,
  user_agent_summary text
);

create index if not exists app_sessions_user_active_idx on public.app_sessions(user_id, revoked_at, expires_at);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.app_users(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'open', 'paused', 'closed', 'archived', 'deleted')),
  data_version bigint not null default 1 check (data_version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  closed_at timestamptz
);

create index if not exists activities_creator_status_idx on public.activities(creator_id, status);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete restrict,
  role text not null check (role in ('member', 'collaborator', 'host')),
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  joined_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  left_at timestamptz,
  unique (activity_id, user_id)
);

create index if not exists memberships_activity_role_idx on public.memberships(activity_id, role, status);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  normalized_name text not null,
  description text not null default '' check (char_length(description) <= 4000),
  sort_order integer not null default 0,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create unique index if not exists teams_activity_name_live_uq on public.teams(activity_id, normalized_name) where deleted_at is null;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 8000),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  progress integer not null default 0 check (progress between 0 and 100),
  assignee_membership_id uuid references public.memberships(id) on delete set null,
  sort_order integer not null default 0,
  data_version bigint not null default 1 check (data_version > 0),
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create index if not exists tasks_activity_team_idx on public.tasks(activity_id, team_id, deleted_at);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  team_id uuid references public.teams(id) on delete restrict,
  task_id uuid references public.tasks(id) on delete restrict,
  uploaded_by uuid not null references public.app_users(id) on delete restrict,
  object_key text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  media_type text not null check (media_type in ('image/png', 'image/jpeg', 'application/pdf', 'text/plain')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('pending', 'active', 'deleted')),
  created_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz,
  check (num_nonnulls(team_id, task_id) <= 1)
);

create index if not exists attachments_activity_resource_idx on public.attachments(activity_id, task_id, status);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete set null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  request_id text not null,
  result text not null check (result in ('success', 'failure')),
  created_at timestamptz not null default timezone('utc', now()),
  metadata_json jsonb not null default '{}'::jsonb
);

create index if not exists audit_events_activity_time_idx on public.audit_events(activity_id, created_at desc);
create index if not exists audit_events_request_action_idx on public.audit_events(request_id, action, actor_user_id);

create table if not exists public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.app_users(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  action text not null,
  operation_id text not null check (char_length(operation_id) between 8 and 96),
  request_fingerprint text not null,
  response_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (actor_user_id, activity_id, action, operation_id)
);

-- Browser clients must not access these tables directly. The application server owns
-- session validation, membership checks, transactions, and audit writes.
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.activities enable row level security;
alter table public.memberships enable row level security;
alter table public.teams enable row level security;
alter table public.tasks enable row level security;
alter table public.attachments enable row level security;
alter table public.audit_events enable row level security;
alter table public.idempotency_records enable row level security;
