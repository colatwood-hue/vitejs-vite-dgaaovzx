-- Personal Knowledge & Reflection System, phase 1.
-- Private by default: RLS on, no policies; only the authenticated server reads or writes.

create type capture_kind as enum ('thought', 'quote', 'book', 'film', 'social_post', 'conversation', 'experience', 'journal', 'other');
create type text_origin  as enum ('human', 'ai');

-- One captured item. The ORIGINAL material, its PROVENANCE and Col's REACTION are kept in separate
-- fields so third-party words are never confused with Col's own thinking.
create table captures (
  id             uuid primary key default gen_random_uuid(),
  kind           capture_kind not null default 'thought',
  title          text not null default '' check (length(title) <= 300),
  -- Original source material, verbatim (a quote, a post, a passage). May be empty for a pure thought.
  content        text not null default '' check (length(content) <= 50000),
  -- Provenance
  source_url     text check (source_url is null or (length(source_url) <= 2000 and source_url ~* '^https?://')),
  attribution    text not null default '' check (length(attribution) <= 300),  -- who said/wrote/made it
  source_title   text not null default '' check (length(source_title) <= 300), -- book, film, account, place
  source_locator text not null default '' check (length(source_locator) <= 200),-- page, timestamp, chapter
  occurred_at    timestamptz,                                                   -- when it was read/heard/happened
  -- Col's own words
  reaction       text not null default '' check (length(reaction) <= 50000),
  -- Derived text, editable, with origin so AI text is never mistaken for Col's
  transcript         text not null default '' check (length(transcript) <= 100000),
  transcript_origin  text_origin,
  summary            text not null default '' check (length(summary) <= 5000),
  summary_origin     text_origin,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint capture_not_empty check (length(title) + length(content) + length(reaction) + coalesce(length(source_url), 0) > 0),
  search tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(source_title, '') || ' ' || coalesce(attribution, '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce(reaction, '') || ' ' || coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce(content, '') || ' ' || coalesce(transcript, '')), 'C')
  ) stored
);
create index captures_search_idx on captures using gin (search);
create index captures_created_idx on captures (created_at desc);
create index captures_kind_idx on captures (kind);
create trigger captures_touch before update on captures for each row execute function touch_updated_at();

create table tags (
  id    uuid primary key default gen_random_uuid(),
  name  citext not null unique check (name ~ '^[a-z0-9][a-z0-9 -]{0,39}$')
);

create table capture_tags (
  capture_id uuid not null references captures (id) on delete cascade,
  tag_id     uuid not null references tags (id) on delete cascade,
  primary key (capture_id, tag_id)
);
create index capture_tags_tag_idx on capture_tags (tag_id);

-- Voice notes, photos, PDFs. Stored in Postgres for now (small files, private, backed up with the DB).
-- Move to private Supabase Storage when files outgrow this.
create table attachments (
  id          uuid primary key default gen_random_uuid(),
  capture_id  uuid not null references captures (id) on delete cascade,
  filename    text not null check (length(filename) between 1 and 200),
  mime_type   text not null check (mime_type in (
                'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav',
                'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain')),
  size_bytes  integer not null check (size_bytes between 1 and 4194304),
  data        bytea not null,
  created_at  timestamptz not null default now()
);
create index attachments_capture_idx on attachments (capture_id);

-- "Promote to Newsletter": an editorial entry linked to the capture. The capture itself is never modified.
alter table entries add column capture_id uuid references captures (id) on delete set null;
create unique index entries_capture_unique on entries (capture_id) where capture_id is not null;

alter table captures     enable row level security;
alter table tags         enable row level security;
alter table capture_tags enable row level security;
alter table attachments  enable row level security;
