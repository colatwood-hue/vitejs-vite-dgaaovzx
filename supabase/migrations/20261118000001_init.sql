-- The Dash: milestone 1 schema.
-- RLS is enabled on every table with NO policies: the Supabase anon/authenticated
-- roles (PostgREST) can read or write nothing. All access goes through the
-- Next.js server using the database connection string.

create extension if not exists pgcrypto;

create type entry_kind as enum ('observation', 'journal', 'voice_note', 'quote', 'question', 'reading');
create type entry_stage as enum ('seed', 'sprouting', 'ready', 'used');
create type issue_status as enum ('draft', 'approved', 'published');

-- Raw material: the author's own observations, experiences and notes.
create table entries (
  id          uuid primary key default gen_random_uuid(),
  kind        entry_kind  not null default 'observation',
  body        text        not null check (length(body) between 1 and 20000),
  pillar      text        not null default 'Philosophy',
  stage       entry_stage not null default 'seed',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index entries_created_at_idx on entries (created_at desc);

create table issues (
  id            uuid primary key default gen_random_uuid(),
  number        integer      not null unique,
  slug          text         not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status        issue_status not null default 'draft',
  subject       text         not null default '',
  preview       text         not null default '',
  title         text         not null default '',
  opening       text         not null default '',
  body          jsonb        not null default '{"type":"doc","content":[]}'::jsonb,
  learning      text         not null default '',
  links         jsonb        not null default '[]'::jsonb,
  question      text         not null default '',
  approved_at   timestamptz,
  published_at  timestamptz,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  -- Human approval is required before anything is published.
  constraint published_requires_approval check (status <> 'published' or (approved_at is not null and published_at is not null))
);
create index issues_published_idx on issues (published_at desc) where status = 'published';

-- Which captured entries an issue was built from (provenance: never invent experiences).
create table issue_sources (
  issue_id  uuid not null references issues (id) on delete cascade,
  entry_id  uuid not null references entries (id) on delete cascade,
  primary key (issue_id, entry_id)
);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger entries_touch before update on entries for each row execute function touch_updated_at();
create trigger issues_touch  before update on issues  for each row execute function touch_updated_at();

alter table entries       enable row level security;
alter table issues        enable row level security;
alter table issue_sources enable row level security;
