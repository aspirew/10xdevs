-- groups: one row per friend group, holds the single invite token.
create table public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  created_by   uuid not null references auth.users(id) on delete cascade,
  invite_token text not null unique default gen_random_uuid()::text,
  created_at   timestamptz not null default now()
);

-- group_members: composite-PK membership rows.
create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Helper to avoid RLS recursion when group_members policies query group_members.
-- security definer = inner SELECT bypasses the table's own RLS, breaking the cycle.
create or replace function public.is_group_member(g uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid()
  );
$$;
revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

-- groups: SELECT if you're a member; INSERT/UPDATE only by the creator.
create policy "groups: members read"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "groups: creator writes"
  on public.groups for insert to authenticated
  with check (created_by = auth.uid());

create policy "groups: creator updates"
  on public.groups for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- group_members: SELECT if you're a member of the same group;
-- INSERT only your own membership row; DELETE only your own row.
create policy "group_members: members read"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_members: self join"
  on public.group_members for insert to authenticated
  with check (user_id = auth.uid());

create policy "group_members: self leave"
  on public.group_members for delete to authenticated
  using (user_id = auth.uid());
