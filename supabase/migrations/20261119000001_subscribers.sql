-- The Dash: milestone 2 (subscribers and sending).
-- Same rule as before: RLS enabled, no policies; only the server touches these tables.

create extension if not exists citext;

create type subscriber_status as enum ('pending', 'active', 'unsubscribed', 'bounced', 'complained');

create table subscribers (
  id                  uuid primary key default gen_random_uuid(),
  email               citext not null unique check (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name                text   not null default '' check (length(name) <= 100),
  status              subscriber_status not null default 'pending',
  -- Consent record: how and when they agreed.
  consent_source      text   not null check (consent_source in ('web_form', 'personal_invite', 'import')),
  consent_at          timestamptz,
  -- Double opt-in: only a SHA-256 hash of the confirmation token is stored.
  confirm_token_hash  text unique,
  confirm_expires_at  timestamptz,
  confirm_sent_at     timestamptz,
  unsubscribed_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint active_requires_consent check (status <> 'active' or consent_at is not null)
);
create index subscribers_status_idx on subscribers (status);
create trigger subscribers_touch before update on subscribers for each row execute function touch_updated_at();

-- Owner test sends must happen after the latest approval before a real send is allowed.
alter table issues add column test_sent_at timestamptz;

create type send_status as enum ('sending', 'sent', 'partial');

-- One real send per issue, ever.
create table sends (
  id            uuid primary key default gen_random_uuid(),
  issue_id      uuid not null unique references issues (id) on delete restrict,
  status        send_status not null default 'sending',
  recipients    integer not null,
  confirmed_at  timestamptz not null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create type delivery_status as enum ('queued', 'sent', 'failed', 'delivered', 'bounced', 'complained');

create table deliveries (
  id             uuid primary key default gen_random_uuid(),
  send_id        uuid not null references sends (id) on delete cascade,
  subscriber_id  uuid not null references subscribers (id) on delete cascade,
  status         delivery_status not null default 'queued',
  provider_id    text unique,
  error          text,
  updated_at     timestamptz not null default now(),
  unique (send_id, subscriber_id)
);
create index deliveries_queued_idx on deliveries (send_id) where status = 'queued';
create trigger deliveries_touch before update on deliveries for each row execute function touch_updated_at();

-- Fixed-window rate limiting for public endpoints (keys are hashed).
create table rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  hits          integer not null
);

-- Processed webhook ids, so retries are idempotent.
create table webhook_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

alter table subscribers    enable row level security;
alter table sends          enable row level security;
alter table deliveries     enable row level security;
alter table rate_limits    enable row level security;
alter table webhook_events enable row level security;
