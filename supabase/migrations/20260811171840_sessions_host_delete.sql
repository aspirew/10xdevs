-- sessions: host delete (defense-in-depth for the cancel-session flow).
--
-- Adds a DELETE policy allowing a session's host — via the authenticated
-- PostgREST path — to remove their own session row. This is defense-in-depth
-- only: the operative auth gate for the cancel-session endpoint lives at the
-- application layer (JS-level host check in the endpoint after fetching the
-- row), matching lessons.md §2 ("Verify PostgREST honors auth.uid() before
-- relying on RLS as the auth gate on Supabase projects"). Admin-client traffic
-- bypasses this policy entirely.
--
-- Retains the S-03 posture: no UPDATE policy (editing a confirmed session is
-- out of scope; cancel + re-confirm is the workflow for changing slot or
-- location).

create policy "sessions: host delete"
  on public.sessions for delete to authenticated
  using (host_user_id = auth.uid() and public.is_group_member(group_id));
