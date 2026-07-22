-- sessions: one confirmed session per (group, slot) tuple.
-- UNIQUE (group_id, slot_date, slot_hour) enforces "one session per slot per group"
-- at the DB layer; the confirm endpoint catches PG error 23505 and returns 409.
-- Composite FK to group_members(group_id, user_id) mirrors the availability table's
-- shape — when a member leaves the group (or the group is deleted), their hosted
-- sessions cascade away with them.
create table public.sessions (
  id            uuid        primary key default gen_random_uuid(),
  group_id      uuid        not null,
  host_user_id  uuid        not null,
  slot_date     date        not null,
  slot_hour     smallint    not null check (slot_hour between 0 and 23),
  location      text        not null check (length(trim(location)) > 0),
  confirmed_at  timestamptz not null default now(),
  unique (group_id, slot_date, slot_hour),
  foreign key (group_id, host_user_id)
    references public.group_members(group_id, user_id) on delete cascade
);

-- Supports the "next upcoming session" banner query and the slot-lookup path:
--   select * from sessions
--   where group_id = $1 and slot_date >= current_date
--   order by slot_date, slot_hour
--   limit 1
create index sessions_group_date_idx on public.sessions (group_id, slot_date);

alter table public.sessions enable row level security;

-- RLS policies are DEFENSE-IN-DEPTH against direct PostgREST traffic with a stolen
-- publishable key. They do NOT gate the admin-client paths used by this app — see
-- context/foundation/lessons.md → "Verify PostgREST honors auth.uid()...".
-- Membership enforcement on admin-client queries is done at the JS layer, not here.
--
-- No UPDATE or DELETE policy is defined — PostgREST denies both by default. This
-- matches v1's "no session editing, no session cancellation" scope (plan.md
-- "What We're NOT Doing"). Postgres role bypasses this for admin-side cleanup.

create policy "sessions: members read"
  on public.sessions for select to authenticated
  using (public.is_group_member(group_id));

create policy "sessions: host insert"
  on public.sessions for insert to authenticated
  with check (host_user_id = auth.uid() and public.is_group_member(group_id));
