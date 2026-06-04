-- availability: one row per (group, user, slot_date, slot_hour) tuple.
-- Composite PK = idempotent mark via ON CONFLICT DO NOTHING; unmark = DELETE by key.
-- Composite FK to group_members(group_id, user_id) auto-cleans availability when
-- a member leaves a group (or the group is deleted).
create table public.availability (
  group_id  uuid        not null,
  user_id   uuid        not null,
  slot_date date        not null,
  slot_hour smallint    not null check (slot_hour between 0 and 23),
  marked_at timestamptz not null default now(),
  primary key (group_id, user_id, slot_date, slot_hour),
  foreign key (group_id, user_id)
    references public.group_members(group_id, user_id) on delete cascade
);

-- Covers the FR-008 aggregate-on-read query:
--   select slot_date, slot_hour, count(*) from availability
--   where group_id = $1 and slot_date between $2 and $3
--   group by slot_date, slot_hour
create index availability_group_date_idx on public.availability (group_id, slot_date);

alter table public.availability enable row level security;

-- RLS policies are DEFENSE-IN-DEPTH against direct PostgREST traffic with a stolen
-- publishable key. They do NOT gate the admin-client paths used by this app — see
-- context/foundation/lessons.md → "Verify PostgREST honors auth.uid()...".
-- Membership enforcement on admin-client queries is done at the JS layer, not here.

create policy "availability: members read"
  on public.availability for select to authenticated
  using (public.is_group_member(group_id));

create policy "availability: self mark"
  on public.availability for insert to authenticated
  with check (user_id = auth.uid() and public.is_group_member(group_id));

create policy "availability: self unmark"
  on public.availability for delete to authenticated
  using (user_id = auth.uid());
