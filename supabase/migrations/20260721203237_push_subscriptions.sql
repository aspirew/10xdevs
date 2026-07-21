-- F-02 Phase 2: per-device Web Push subscriptions keyed by endpoint URL.
-- Cascade-deletes when the user is removed. RLS follows S-01/S-02 shape:
-- SELECT/DELETE gated by user_id = auth.uid() (defense-in-depth against direct
-- anon PostgREST); INSERT/UPDATE only via service role (admin client through
-- our API endpoints, per context/foundation/lessons.md §"Verify PostgREST
-- honors auth.uid()…").

create table push_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  endpoint           text not null unique,
  p256dh             text not null,
  auth               text not null,
  expiration_time    timestamptz,
  user_agent         text,
  created_at         timestamptz not null default now(),
  last_success_at    timestamptz,
  last_failure_at    timestamptz,
  failure_count      integer not null default 0
);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions: self read"
  on push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions: self delete"
  on push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
