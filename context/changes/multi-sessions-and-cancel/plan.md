# Multiple Sessions per Group + Host-Only Cancellation Implementation Plan

## Overview

Loosen S-03's "one visible session per group" UI guard and add a session-cancellation affordance. Any group member can propose additional sessions at any future slot (the DB already allows this via UNIQUE-per-slot); each confirmed session gets a ★ badge on its cell; the session's host — and only that host — sees a ✗ button in the calendar's right column on the day that session lives, opening a small confirmation dialog that fires a "Session cancelled" push to every group member.

## Current State Analysis

- `supabase/migrations/20260722194111_sessions.sql` — table has `UNIQUE (group_id, slot_date, slot_hour)`, no UPDATE/DELETE policy (deliberate S-03 "no editing / no cancellation" scope; documented inline).
- `src/lib/sessions.ts:35` — `getNextUpcomingSession(admin, groupId)` returns the earliest future `SessionWithHost | null` (LIMIT 1). Called only from `src/pages/groups/[id].astro:103`.
- `src/pages/api/groups/[id]/sessions.ts` — POST handler (S-03) with sequential fan-out to `sendPushToUser` per group member; payload `{title: "Session confirmed", body: "<slot> · <location>", url, tag: "session-<id>"}`.
- `src/components/GroupCalendar.tsx` — prop `confirmedSession?: {slot_date, slot_hour, iAmHost}` drives (a) the ★ badge on the confirmed cell and (b) `const showConfirmColumn = confirmedSession == null || confirmedSession.iAmHost` which hides the entire ✓ column for non-hosts once a session exists. The right-column ✓ button, when the viewer has marked the day, opens `ConfirmSessionDialog` at their own start-hour.
- `src/pages/groups/[id].astro:222-238` — SSR fetches `nextSession`, computes `iAmHost = nextSession.host_user_id === user.id`, passes both fields to `<GroupCalendar>`.
- `src/components/ConfirmSessionDialog.tsx` — small shadcn `Dialog` primitive with a location `Input`; on 2xx caller reloads. Direct model for the parallel `CancelSessionDialog`.
- `src/lib/push.ts` — `sendPushToUser(admin, userId, {title, body, url?, tag?})` and `PushPayload` type; cancel simply calls this with a different payload. No F-02 changes needed.

### Key Discoveries

- The DB already permits arbitrary multi-session per group across different `(slot_date, slot_hour)` tuples; the "one visible session" limitation was purely client-side (`getNextUpcomingSession` + `showConfirmColumn` gate). Multi-session support is a UI-layer change, no schema change.
- `getNextUpcomingSession` has exactly one caller — safe to replace with `getUpcomingSessions` returning the whole array; the banner reads `[0]`.
- `ConfirmSessionDialog` is the exact structural template for `CancelSessionDialog` — same shadcn primitive, same slot-summary + button pair, same POST-then-reload flow (with DELETE instead of POST).
- The `tag: "session-<id>"` on push notifications is stable across confirm and cancel — the OS uses the tag to collapse notifications, so a cancel push with the same tag replaces a still-visible "confirmed" push. This is a feature.

## Desired End State

- A signed-in group member on `/groups/<id>` sees a ★ badge on every future confirmed slot in the visible window (not just the earliest).
- On any day where the viewer has marked their availability and no session is confirmed at their marked hour, the right column shows a ✓ button — irrespective of whether other members' sessions exist elsewhere in the group. Clicking ✓ opens `ConfirmSessionDialog` at the viewer's start-hour (S-03 flow, unchanged).
- On any day where a session is confirmed and the viewer is the host of that session, the right column shows a ✗ button. Clicking ✗ opens `CancelSessionDialog` with a slot summary + "Everyone will get a notification" warning + Cancel/Confirm Cancel buttons. Confirm sends `DELETE /api/groups/[id]/sessions/[session_id]`, fans out one "Session cancelled" push per group member, then reloads the page.
- Banner still shows the single next-upcoming session (or nothing when there are none). After a cancel it auto-promotes to the next-earliest.
- Two or more sessions can coexist in the visible window; each gets a ★; each of their hosts sees their own ✗.
- Non-hosts of a specific confirmed session see no button on that session's day-row (unless they've marked availability that day at a slot with no session — then they see ✓, per Rule 2 above).
- `sessions` table gains a defense-in-depth `sessions: host delete` RLS policy in a new migration.
- All existing S-03 behavior (confirm flow, banner render, push notification, membership auth, past-slot rejection, UNIQUE 23505 → 409 translation) preserved.

Verification: two Google accounts on two devices in one group. Account A confirms session S1 at Sat 15:00. Account B confirms session S2 at Sun 18:00. Both cells show ★. Account A sees ✗ on Sat, no button on Sun. Account B sees ✗ on Sun, no button on Sat. Banner shows S1 (earlier). Account A clicks ✗ Sat → dialog → Confirm → push "Session cancelled · Sat, Oct 3 · 3pm · Anna's place" lands on both devices; page reloads; banner now shows S2; ★ on Sun remains; ✗ still visible for B on Sun.

## What We're NOT Doing

- No per-day cap on sessions. Two sessions on the same day at different hours are DB-permitted; UI doesn't add a soft cap. If a group tries this (unusual for friend-group scale) it works.
- No session editing (change location, change slot). To move a session: cancel + confirm again.
- No cancel reason / note field. Just cancel and notify.
- No cancel-notification variant (excluding the host, including a "cancelled by" label, etc.). Symmetric with confirm: everyone gets the push, including the cancelling host — proves the pipeline on the initiator's own device.
- No new push payload type. Reuses F-02's `PushPayload`.
- No session history / past-sessions list. Past cells remain non-interactive as today.
- No listing surface for multiple confirmed sessions beyond the calendar cells + the "next" banner. If a group has three future sessions, only the earliest shows in the banner; the other two are visible as ★ badges in the calendar.
- No breaking change to the confirm push payload — same `title`, `body`, `url`, `tag` shape.
- No revocation of the S-03 UNIQUE constraint. A member cannot confirm a second session at a slot that already has one; still returns 409.
- No new push tag scheme. Cancel reuses `session-<id>` so the OS collapses/replaces any still-visible "confirmed" push for the same session.
- No automated tests (consistent with S-02/S-03/F-02); manual smoke + prod verify.

## Implementation Approach

Three sequential phases mirroring S-03's shape (schema → server → UI). Each phase is independently landable and verifiable.

**Phase 1** adds the DELETE RLS policy. No user-visible change. Landing it first means Phase 2's DELETE endpoint has the DB layer to rely on (defense-in-depth against direct PostgREST traffic; the operative gate is the JS-level host check in the endpoint per lessons.md §2).

**Phase 2** builds the server: `getUpcomingSessions` helper replaces `getNextUpcomingSession`; new `DELETE /api/groups/[id]/sessions/[session_id]` endpoint. `curl` smoke verifies all branches (200 with fan-out, 401/403/404, 409 already-cancelled).

**Phase 3** ships the UI: SSR-side switch from single-session to array; `GroupCalendar` prop shape change; new `CancelSessionDialog`; the `showConfirmColumn` gate goes away; per-row logic maps day → session → ✗ if host, else fall through to existing ✓ logic. On success reload — banner and calendar re-render from SSR truth.

## Critical Implementation Details

- **Prop shape breaking change.** `GroupCalendar`'s `confirmedSession?: {slot_date, slot_hour, iAmHost} | null` becomes `confirmedSessions?: ConfirmedSession[]` where `ConfirmedSession = {id, slot_date, slot_hour, location, iAmHost}`. Downstream all cell-badge and confirm-column logic must handle "many sessions" instead of "at most one". Any past callers of the old prop shape (there is exactly one: `groups/[id].astro`) update in the same phase.
- **`getNextUpcomingSession` retired, not deprecated.** Only one caller, replaced in the same commit. Keeping a shim adds no value and just leaves dead code.
- **Server-side host check on cancel is BOTH the operative auth gate AND the 404 discriminator.** After the membership check, fetch the session by id (scoped to the group). If not found → 404 (whether it never existed or was already deleted). If found but `host_user_id !== user.id` → 403 (the caller is a member but not the session's host). Only after both pass, DELETE. This ordering keeps error messages non-leaky.
- **DELETE + fan-out ordering.** DELETE the session row first; only if it succeeds, fan out the push. If DELETE fails, no push. Rationale: users should never receive a "cancelled" push for a session that's actually still confirmed. Errors from the fan-out itself are swallowed and logged (like S-03) — the DB row is already gone, and a partial push failure shouldn't undo that.
- **`tag: "session-<id>"` intentionally identical between confirm + cancel.** Web Push spec: same tag replaces any still-visible notification for that key. If a member's phone still shows "Session confirmed · Sat 3pm · Anna's" and then the host cancels, the cancel push updates that notification in-place to "Session cancelled · Sat 3pm · Anna's" — exactly the UX we want.
- **`iAmHost` computation stays server-side.** The SSR-side loop in `groups/[id].astro` computes `iAmHost` per session against `user.id` before serializing to the client, so the client never sees other members' host_user_ids. Matches the S-03 privacy posture where full user identities weren't sent to the wire.

## Phase 1: `sessions: host delete` RLS Migration

### Overview

Add a defense-in-depth RLS policy allowing a session's host to DELETE their own session via the authenticated PostgREST path. The operative gate remains the JS-level check in the endpoint (lessons.md §2 — PostgREST `auth.uid()` is broken on this project so admin-client traffic bypasses RLS anyway), but the policy exists so that any future direct-anon traffic can't wipe rows.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_sessions_host_delete.sql` (produce timestamp via `date -u +%Y%m%d%H%M%S`)

**Intent**: Add one new RLS policy to `public.sessions` allowing DELETE by the host of a session. Mirrors the shape of the existing "sessions: host insert" policy from the S-03 migration.

**Contract**:
- `create policy "sessions: host delete" on public.sessions for delete to authenticated using (host_user_id = auth.uid() and public.is_group_member(group_id));`
- Include a comment: this is defense-in-depth; the operative gate is the JS-level host check in the endpoint per lessons.md §2. Also update the "No UPDATE or DELETE policy is defined" comment block in the previous migration by leaving it alone (that comment reflects the pre-cancel S-03 scope; adding to it here would edit a historical migration, which is forbidden).

### Success Criteria

#### Automated Verification

- Migration file exists at `supabase/migrations/<timestamp>_sessions_host_delete.sql`
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification

- Migration applied via `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl`
- Studio: `\d+ public.sessions` shows the new policy in the RLS block
- Studio anon smoke: `delete from public.sessions where id = '<any-id>';` as anon → permission denied (0 rows affected). RLS defense holds.
- Studio postgres smoke: insert a test session as postgres role, verify the policy expression parses cleanly, delete via SQL to clean up
- `git log -- supabase/migrations/` shows the new file after phase-end commit

**Implementation Note**: After Phase 1 lands and manual verification passes, pause for confirmation before starting Phase 2.

---

## Phase 2: `getUpcomingSessions` Helper + DELETE Endpoint

### Overview

Replace the single-session helper with an array-returning one, and add the DELETE endpoint. Both the confirm path (existing) and the cancel path (new) share the same fan-out shape via `sendPushToUser`. `curl` smoke covers all branches before touching UI.

### Changes Required

#### 1. Sessions helper module

**File**: `src/lib/sessions.ts`

**Intent**: Replace `getNextUpcomingSession` with `getUpcomingSessions` returning all future sessions ordered ascending by `(slot_date, slot_hour)`. The banner reads `[0]`; the calendar renders ★ badges for the whole array. Simpler contract, one call site.

**Contract**:
- Export `async function getUpcomingSessions(admin: SupabaseClient, groupId: string): Promise<SessionWithHost[]>` — query `sessions where group_id = $1 and slot_date >= today order by slot_date asc, slot_hour asc` (no LIMIT); resolve each row's `host_email` via `admin.auth.admin.getUserById` in parallel (`Promise.all`).
- Retire `getNextUpcomingSession` — delete the function; the sole caller (`groups/[id].astro`) is updated in the same phase (via Change 3 below).
- The existing `Session` and `SessionWithHost` interfaces stay unchanged.

#### 2. DELETE endpoint

**File**: `src/pages/api/groups/[id]/sessions/[session_id].ts` (new file — Astro dynamic segment)

**Intent**: Accept a DELETE request from the session's host, remove the row, then fan out one "Session cancelled" push per group member. Uses the same auth preamble + fan-out pattern as the S-03 POST endpoint for symmetry.

**Contract**:
- Method: `DELETE` (export `DELETE: APIRoute`)
- URL: `/api/groups/[id]/sessions/[session_id]`
- Auth preamble mirrors `src/pages/api/groups/[id]/sessions.ts:17-27`: user → id → session_id → admin
  - `user.id` from `context.locals.user`; 401 if absent
  - `id` from `context.params`; 400 if missing
  - `session_id` from `context.params`; 400 if missing
  - `admin` from `createAdminClient()`; 500 if null
- Membership: JS-level `group_members` check via admin; 403 if not a member
- Session fetch: `admin.from("sessions").select("id, group_id, host_user_id, slot_date, slot_hour, location").eq("id", session_id).eq("group_id", id).maybeSingle()`; 404 if not found (covers both nonexistent and mismatched-group cases)
- Host check: `session.host_user_id !== user.id` → 403 `{error: "Only the session host can cancel"}`
- DELETE: `admin.from("sessions").delete().eq("id", session_id)`; 500 on error
- Fan-out: same shape as S-03 confirm — SELECT `user_id` from `group_members WHERE group_id = $1`, loop sequentially, `sendPushToUser(admin, memberId, payload)` where payload is `{title: "Session cancelled", body: "<formatSlotLabel> · <location>", url: '/groups/' + id, tag: 'session-<session_id>'}`; aggregate `{sent, failed, deleted}`
- Log line: `console.log("session", session_id, "→ cancel fanout: sent=X failed=Y deleted=Z")`
- Response: `json(200, {ok: true})`

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- Files exist: `src/pages/api/groups/[id]/sessions/[session_id].ts`; `getUpcomingSessions` exported from `src/lib/sessions.ts`; `getNextUpcomingSession` removed from `src/lib/sessions.ts`

#### Manual Verification

- Dev server running (`npm run dev`); a real group with a confirmed session (from S-03) available; a captured signed-in cookie for the session's host
- `curl -X DELETE` (host cookies) against `/api/groups/<gid>/sessions/<sid>` returns `{ok: true}`; row gone from Studio; server logs show `session <sid> → cancel fanout: sent=X failed=Y deleted=Z`
- Real push notification lands on both iOS + Android PWA of the host within seconds; body reads "Session cancelled · <slot> · <location>"; tapping the notification opens `/groups/<gid>`
- Repeated `curl` on the same session_id returns 404 `{error: "Session not found"}` (already deleted)
- `curl` DELETE as a signed-in group member who is NOT the session's host → 403 `{error: "Only the session host can cancel"}` (row NOT deleted)
- `curl` DELETE as a signed-in user who is NOT a member of the group → 403 `{error: "Not a member of this group"}`
- Unauthenticated `curl` DELETE → 401
- `curl` DELETE with a nonexistent session_id → 404
- `curl` DELETE with a session_id belonging to a different group than the URL's `[id]` → 404 (defense-in-depth: mismatched-group looks the same as nonexistent)
- `getUpcomingSessions(admin, groupId)` returns an array ordered by `(slot_date, slot_hour) asc`; returns `[]` when no future sessions; each element carries `host_email` from `auth.users`

**Implementation Note**: After Phase 2 lands and manual verification passes, pause for confirmation before starting Phase 3.

---

## Phase 3: Multi-Badge UI + Cancel Dialog + Column Ungate

### Overview

SSR-side switch from single-session to array. `GroupCalendar` receives `confirmedSessions: ConfirmedSession[]`. The ★ badge renders on any cell matching any session. The right column's per-row logic maps day → session → ✗ (opens `CancelSessionDialog`) if viewer is that session's host; otherwise falls through to the existing ✓ logic for confirming a new session. `showConfirmColumn` and its associated hint conditional go away — the column is always shown.

### Changes Required

#### 1. New `CancelSessionDialog` component

**File**: `src/components/CancelSessionDialog.tsx` (new)

**Intent**: Small shadcn `Dialog` that asks the host to confirm a cancellation, then issues the DELETE. Structural twin of `ConfirmSessionDialog`. On 2xx calls `onConfirmed`. On failure shows inline error and stays open.

**Contract**:
- Props: `{ groupId: string; session: {id: string; slot_date: string; slot_hour: number; location: string} | null; onCancel: () => void; onConfirmed: () => void; }`
- Open state derived from `session !== null`
- Uses shadcn `Dialog` primitives from `@/components/ui/dialog`
- Body: `DialogTitle` "Cancel session"; `DialogDescription` `<formatSlotLabel(...)> · <location>`; a short warning line "Everyone in the group will get a notification."; `DialogFooter` with two buttons — "Keep session" (variant outline, calls `onCancel`) and "Cancel session" (variant destructive, submits)
- Submit handler: DELETE to `/api/groups/${groupId}/sessions/${session.id}` with no body; on 2xx call `onConfirmed`; on non-2xx read `{error}` and show it inside the dialog (inline red text pattern reused from `ConfirmSessionDialog`)
- Submit button disabled while inflight
- Component remount for state reset via `key={session?.id ?? 'closed'}` from the caller (matches `ConfirmSessionDialog` pattern)

#### 2. Extend Astro group page — array + iAmHost computation

**File**: `src/pages/groups/[id].astro`

**Intent**: Fetch all upcoming sessions (not just the earliest); compute `iAmHost` per session server-side; pass array to `<GroupCalendar>`; banner still renders from `[0]`.

**Contract**:
- Replace `import { getNextUpcomingSession, type SessionWithHost }` with `import { getUpcomingSessions, type SessionWithHost }`
- Replace the `let nextSession: SessionWithHost | null = null; ... nextSession = await getNextUpcomingSession(admin, group.id);` block with `let upcomingSessions: SessionWithHost[] = []; ... upcomingSessions = await getUpcomingSessions(admin, group.id);`
- Derive `const nextSession = upcomingSessions[0] ?? null;` for the banner render (whose block is unchanged except this rebind)
- Change the `<GroupCalendar>` mount's `confirmedSession={...}` prop to `confirmedSessions={upcomingSessions.map((s) => ({ id: s.id, slot_date: s.slot_date, slot_hour: s.slot_hour, location: s.location, iAmHost: s.host_user_id === user.id }))}`

#### 3. `GroupCalendar` — prop change, multi-badge, ✗ button, ungate column

**File**: `src/components/GroupCalendar.tsx`

**Intent**: Accept an array of confirmed sessions; render ★ on every matching cell; replace the `showConfirmColumn` gate with an always-visible column; per-row map day → session → ✗ button when the viewer is that session's host, else the existing ✓ path; add `CancelSessionDialog` state + mount alongside the existing confirm dialog.

**Contract**:
- Replace `ConfirmedSessionSlot` interface + `confirmedSession?: ConfirmedSessionSlot | null` prop with a new `ConfirmedSession` interface — `{ id: string; slot_date: string; slot_hour: number; location: string; iAmHost: boolean }` — and prop `confirmedSessions?: ConfirmedSession[]`
- Delete the `showConfirmColumn` const at :61 and every `{showConfirmColumn && ...}` conditional throughout the render
- Per-row, look up the viewer's own hosted session on that day: `const myHostedSessionOnDay = (confirmedSessions ?? []).find((s) => s.slot_date === day && s.iAmHost);`. This guarantees each host reaches their own ✗ affordance regardless of whether other hosts have confirmed sessions on the same day at different hours (the plan permits this — "no per-day cap"). ★ badges still render on every matching cell via the existing `.some` check.
- Cell rendering: replace the current `isConfirmed = confirmedSession != null && confirmedSession.slot_date === day && confirmedSession.slot_hour === h` with a lookup against the array: `const isConfirmed = (confirmedSessions ?? []).some((s) => s.slot_date === day && s.slot_hour === h);` — ★ renders on every matching cell
- Right-column per-row logic:
  - If `myHostedSessionOnDay` is defined → render a ✗ button with `aria-label="Cancel session on <day> at <hour>:00"`, className mirrors the existing ✓ button but the icon character is "✗" and the hover color hint is red instead of purple; `onClick` sets a new local state `cancelSession: ConfirmedSession | null` to `myHostedSessionOnDay`
  - Else if `myStart !== undefined && !isPastSlot(day, myStart)` → render the existing ✓ button (unchanged S-03 confirm path)
  - Else → render the empty placeholder span (unchanged)
- Add state `const [cancelSession, setCancelSession] = useState<ConfirmedSession | null>(null);` next to the existing `dialogSlot`
- Mount `<CancelSessionDialog>` at the bottom of the return, next to the existing `<ConfirmSessionDialog>`, with `key`, `groupId`, `session={cancelSession}`, `onCancel={() => setCancelSession(null)}`, `onConfirmed={() => window.location.reload()}`
- The hint text tail about the ✓ button stays as-is (the column is always shown now); the `{showConfirmColumn && ...}` wrapper around that segment is removed

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- Files exist: `src/components/CancelSessionDialog.tsx`; `groups/[id].astro` imports `getUpcomingSessions`; `GroupCalendar.tsx` no longer references `showConfirmColumn` or the singular `confirmedSession` prop

#### Manual Verification

- Two Google accounts (A + B) both members of one group, both push-subscribed via `/install`
- A confirms a session S1 at Sat 15:00 with location "Cafe" — banner appears; ★ badge renders on the Sat 15:00 cell
- A sees ✗ button on the Sat row (its column position); B sees NO button on the Sat row
- B confirms a session S2 at Sun 18:00 with location "Anna's" — S2's ★ appears on the Sun 18:00 cell (both members see both stars); banner still shows S1 (the earlier one); B sees ✗ button on Sun; A sees NO button on Sun
- A clicks ✗ on Sat → CancelSessionDialog opens with "Cancel session · Sat, Oct 3 · 3pm · Cafe" and a warning line "Everyone in the group will get a notification"
- A clicks "Keep session" → dialog closes; nothing changes
- A clicks ✗ again → "Cancel session" → both A and B receive a push notification titled "Session cancelled" body "Sat, Oct 3 · 3pm · Cafe" (tab closed on B's device); page reloads; banner now shows S2; ★ gone from Sat cell; ★ still on Sun 18:00; if A had marked availability on Sat, the ✓ button returns on Sat
- With a session cancelled and now zero future sessions in the group: banner disappears; every marked-availability day (past-check passed) shows ✓ for the viewer
- Non-host attempting DELETE via curl against a session they don't host → 403 (regression check for Phase 2)
- Repeated DELETE via curl on already-cancelled session → 404 (regression check)
- Server logs on Vercel show one `session <id> → cancel fanout: sent=X failed=Y deleted=Z` line per cancel
- Lighthouse PWA audit still passes on the group page
- Production smoke on `https://10xdevs-lilac.vercel.app`: same flow with real devices
- Tag production deploy as `prod-<date>-multi-cancel` after production smoke passes

**Implementation Note**: After Phase 3 lands and all manual verification passes, this slice is complete.

---

## Testing Strategy

### Manual Testing Steps

1. **Two-account, two-device end-to-end** — Confirm S1 as A, confirm S2 as B, verify banners + stars from each viewer; cancel S1 as A, verify push reaches both, banner promotes to S2.
2. **Access control probe** — Try to cancel B's session as A (should get 403 in curl AND no ✗ button in UI). Try to cancel a nonexistent session_id (404).
3. **Multi-session on same day** — Confirm S1 at day D 15:00, then S2 at day D 20:00 (needs an availability mark at 20:00). Verify both ★ badges render; the ✗ button (assuming user is host of at least one) targets the earlier one.
4. **Cancel + rebuild** — Cancel S1, verify ✓ returns on that day-row if the viewer still has an availability mark.
5. **Race probe** — Two devices signed in as A on the same group; both cancel the same session simultaneously; one wins with 200, the other gets 404 with an inline dialog error.
6. **iOS notification collapsing** — Watch that the cancel push replaces (not appends to) any still-visible "confirmed" push for the same session — visible tag-based behavior.

## Performance Considerations

Friend-group scale (`target_scale.users: small`) makes multi-session performance a non-concern. The DELETE endpoint does:
- 1 SELECT (membership)
- 1 SELECT (session by id + group_id)
- 1 DELETE (sessions)
- 1 SELECT (group_members for fan-out)
- N `sendPushToUser` calls (N ≤ 10 group members)

Well under Vercel's 300s default timeout. The extended `getUpcomingSessions` query returns O(sessions) rows without LIMIT; for a small friend group with <20 future sessions this is trivially indexed by `sessions_group_date_idx` (created in the S-03 migration).

## Migration Notes

- Applies cleanly on top of all prior migrations. No dependencies on other feature work.
- Rollback: `drop policy "sessions: host delete" on public.sessions;` — no data change, no cross-table triggers to unwind. Client rollback is `git revert` on Phase 2/3 commits.

## References

- Ticket source: `context/changes/multi-sessions-and-cancel/change.md`
- S-03 archive (confirm flow + auth pattern + push helper contract): `context/archive/2026-07-22-confirm-session-with-push-notification/plan.md`
- Lessons: `context/foundation/lessons.md` §2 (JS-layer auth gate), §5 (migrations via CLI only)
- Existing sessions endpoint (template for DELETE handler): `src/pages/api/groups/[id]/sessions.ts`
- Existing confirm dialog (template for CancelSessionDialog): `src/components/ConfirmSessionDialog.tsx`
- Existing calendar host-gate to remove: `src/components/GroupCalendar.tsx` (`showConfirmColumn` const + conditionals)
- Push helper (unchanged, called with different payload): `src/lib/push.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: `sessions: host delete` RLS Migration

#### Automated

- [x] 1.1 Migration file exists at `supabase/migrations/<timestamp>_sessions_host_delete.sql` — 56e626e
- [x] 1.2 `npm run typecheck` passes — 56e626e
- [x] 1.3 `npm run lint` passes — 56e626e
- [x] 1.4 `npm run build` succeeds — 56e626e

#### Manual

- [x] 1.5 Migration applied via `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl` — 56e626e
- [x] 1.6 Studio: `\d+ public.sessions` shows the new DELETE policy in the RLS block — 56e626e
- [x] 1.7 Studio anon smoke: DELETE against a real row as anon → permission denied — 56e626e
- [x] 1.8 Studio postgres smoke: policy expression parses cleanly on a test row — 56e626e
- [x] 1.9 `git log -- supabase/migrations/` shows the new file after phase-end commit — 56e626e

### Phase 2: `getUpcomingSessions` Helper + DELETE Endpoint

#### Automated

- [x] 2.1 `npm run typecheck` passes — c2aab9e
- [x] 2.2 `npm run lint` passes — c2aab9e
- [x] 2.3 `npm run build` succeeds — c2aab9e
- [x] 2.4 Files exist: `src/pages/api/groups/[id]/sessions/[session_id].ts`; `getUpcomingSessions` exported; `getNextUpcomingSession` removed — c2aab9e

#### Manual

- [x] 2.5 `curl -X DELETE` (host cookies) valid → 200 `{ok:true}`; row gone in Studio; server logs show `session <sid> → cancel fanout: sent=X failed=Y deleted=Z` — c2aab9e
- [x] 2.6 Real push notification arrives on host's iOS + Android PWAs (tab closed) within seconds — c2aab9e
- [x] 2.7 Repeated DELETE on the same session_id → 404 `{error: "Session not found"}` — c2aab9e
- [x] 2.8 DELETE as signed-in member who is NOT the session's host → 403 `{error: "Only the session host can cancel"}` — c2aab9e
- [x] 2.9 DELETE as signed-in user who is NOT a group member → 403 `{error: "Not a member of this group"}` — c2aab9e
- [x] 2.10 Unauthenticated DELETE → 401 — c2aab9e
- [x] 2.11 DELETE with nonexistent session_id → 404 — c2aab9e
- [x] 2.12 DELETE with session_id from a different group than the URL's `[id]` → 404 — c2aab9e
- [x] 2.13 `getUpcomingSessions(admin, groupId)` returns an ordered array with resolved `host_email`s; returns `[]` for a group with no future sessions — c2aab9e

### Phase 3: Multi-Badge UI + Cancel Dialog + Column Ungate

#### Automated

- [x] 3.1 `npm run typecheck` passes
- [x] 3.2 `npm run lint` passes
- [x] 3.3 `npm run build` succeeds
- [x] 3.4 Files exist: `src/components/CancelSessionDialog.tsx`; `GroupCalendar.tsx` uses `confirmedSessions` array prop
- [x] 3.5 `groups/[id].astro` imports `getUpcomingSessions` and passes `confirmedSessions` array to `<GroupCalendar>`

#### Manual

- [x] 3.6 Two accounts (A + B), one group: A confirms S1 Sat 15:00 "Cafe" → both members see ★ on the cell; A sees ✗ on Sat row; B sees no button on Sat row
- [x] 3.7 B confirms S2 Sun 18:00 "Anna's" → both members see ★ on both cells; banner still shows S1 (earlier); B sees ✗ on Sun; A sees no button on Sun
- [x] 3.8 A clicks ✗ Sat → CancelSessionDialog shows slot + location + "Everyone will get a notification"; "Keep session" closes dialog, "Cancel session" submits
- [x] 3.9 Successful cancel → both A and B receive push "Session cancelled · Sat, Oct 3 · 3pm · Cafe" (tab closed on B); page reloads; banner now S2; ★ gone from Sat cell; if A had marked availability on Sat, ✓ returns
- [x] 3.10 With zero future sessions after cancel: banner disappears; ✓ shows normally on all marked-availability days
- [x] 3.11 Non-host UI has no ✗ on other members' session days; can still confirm own sessions on days they mark
- [x] 3.12 Attempt to cancel already-cancelled session (race via two tabs) → dialog shows 404 error inline, stays open
- [x] 3.13 Server logs on Vercel show one `session <id> → cancel fanout: sent=X failed=Y deleted=Z` line per cancel
- [x] 3.14 Lighthouse PWA audit passes on the group page (no regression)
- [x] 3.15 Production smoke on `https://10xdevs-lilac.vercel.app` covers 3.6–3.13 end-to-end with real devices
- [x] 3.16 Tag production deploy as `prod-<date>-multi-cancel`
