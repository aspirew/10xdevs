# Confirm Session with Push Notification — Implementation Plan

## Overview

Ship S-03, the north-star slice. A group member picks a future slot from the shared calendar, sets a free-text meeting location in a dialog, and confirms — becoming that session's host. A row lands in a new `sessions` table (UNIQUE per group+slot). The server fans out one Web Push per group member (including the host) via `sendPushToUser` from F-02, logs the fan-out summary, and the `/groups/[id]` page surfaces the next upcoming session as a banner plus a subtle badge on the confirmed cell. Closes US-01 end-to-end.

## Current State Analysis

- **Availability (S-02) is live** — `availability` table with composite PK `(group_id, user_id, slot_date, slot_hour)` and start-hour semantic (a member's `slot_hour` is their earliest available hour that day; overlap at `(date, h)` = members whose start-hour ≤ h on that date). `getAvailabilityWindow(admin, groupId, userId, start, end, groupSize?)` in `src/lib/availability.ts` is the read helper. The calendar surfaces overlap and threshold visually.
- **PWA + push (F-02) is live** — `push_subscriptions` table, `sendPushToUser(admin, userId, payload)` in `src/lib/push.ts` (410/404 → row delete; other errors → increment `failure_count`), the service worker handles `push` and `notificationclick` (opens `payload.url ?? "/groups"`).
- **Auth pattern is locked** — `locals.user` gate + `createAdminClient()` + JS-level `group_members` membership check + RLS as defense-in-depth. PostgREST `auth.uid()` is broken on this project (lessons.md §2); RLS cannot be trusted as the operative gate on admin-client traffic.
- **Endpoint conventions are set by S-02** — JSON in / JSON out, `{ok: true}` on success, `{error: string}` with 4xx status on failure, standard preamble (user → id → JSON parse → admin → membership → work).
- **Migrations flow via CLI only** — `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl`; never Studio SQL editor (lessons.md §5).
- **Calendar mount pattern is set** — `<GroupCalendar client:load groupId initial initialStart />` in `src/pages/groups/[id].astro`; server prepares `AvailabilityWindow` and passes it as `initial`.
- **shadcn CLI is configured** — `components.json` present, style `new-york`, alias `@/components/ui`. Installed primitives: `button`, `card`, `input`, `label`. `dialog` is not yet installed.
- **No `sessions` table**, no confirm surface, no fan-out call site. This slice adds all of it.

### Key Discoveries

- `sendPushToUser` in `src/lib/push.ts` already returns `{sent, failed, deleted}` — the confirm endpoint can trivially aggregate these across members and log one summary line. No F-02 changes needed.
- The composite FK pattern `(group_id, user_id) → group_members(group_id, user_id)` used by `availability` is the right template for `sessions.(group_id, host_user_id)` — mirrors S-02 exactly and cascades cleanly if a member leaves or the group is deleted.
- `groups/[id].astro` already has `admin`, `memberIds`, and the user list in scope by the time it renders the calendar (`src/pages/groups/[id].astro:82–95`) — the SSR path for `sessionInitial` slots naturally next to `calendarInitial`.
- `notificationclick` in `public/sw.js` already opens `payload.url ?? "/groups"` — passing `url: "/groups/<id>"` in the push payload lands members on the group page with the banner primed.
- `GroupCalendar.tsx` already exposes tap-to-toggle on cells and gates past cells via `isPastSlot()`. Adding a long-press handler that ignores past cells is a natural extension of the existing gesture layer.

## Desired End State

- A signed-in group member on `/groups/<id>` sees the calendar as before. When they long-press (or mouse-hold ≥ 500ms on) a future cell with at least one member available at that start-hour, a shadcn `Dialog` opens with a read-only slot summary ("Sat, Oct 3 · 7pm · 3/5 available") and an `Input` for location. On Confirm the client POSTs `{slot_date, slot_hour, location}` to `/api/groups/<id>/sessions`; on 200 the page reloads and the banner + cell badge reflect the new session.
- Every group member — including the host — receives a Web Push titled "Session confirmed" with body "Sat, Oct 3 · 7pm · Anna's place" and `url: "/groups/<id>"`. The push arrives even with the tab closed on both iOS Safari (installed as PWA) and Android Chrome (installed or in-browser).
- `sessions` table has one row per (group, slot); UNIQUE (group_id, slot_date, slot_hour) is enforced at the DB layer; second confirm at the same slot returns 409 `{error: "Slot already has a confirmed session"}`.
- A member unmarking their availability at a confirmed slot succeeds silently; the session row is untouched (PRD Open Q #2 resolution).
- `getNextUpcomingSession(admin, groupId)` reads the earliest session with `slot_date >= today`; the SSR banner renders when one exists.
- Server console log after each confirm: `session <id> → fanout: sent=X failed=Y deleted=Z` (viewable in Vercel logs).

Verification: two Google accounts on two devices, one iOS + one Android, both installed as PWA from a Vercel Preview. Member A confirms a slot; the push arrives on both devices with tab closed; the banner shows on both after page nav. Repeated confirm on the same slot returns 409. Member B unmarking their availability at that slot succeeds; the session banner is unchanged.

## What We're NOT Doing

- **No session editing.** Location or slot cannot be changed after confirm. If a mistake is made, PRD Open Q #2 is silent; v1 answer is "live with it or delete manually via Studio."
- **No session cancellation.** No `DELETE /sessions/<id>` endpoint, no cancel push, no UI. The host-unmark-cancels flow was explicitly rejected in questioning.
- **No session history view.** Past sessions stay in the DB (no delete) but have no UI surface. Only the next upcoming session is banner-rendered.
- **No multiple concurrent future sessions in the banner.** The query is `LIMIT 1`. Friend-group cadence rarely produces >1 future session at a time; if this becomes a real complaint it's a v2 UI change (no schema change).
- **No cross-table trigger between availability and sessions.** Unmarking at a confirmed slot succeeds; no cascade, no reference count, no locking. Sessions decouple from availability at confirm time.
- **No push denial fallback** (PRD Open Q #3). Per roadmap Unknowns, v1 accepts the risk; instrumentation is the hedge.
- **No new push payload types.** Reuses F-02's `PushPayload = {title, body, url?, tag?}`.
- **No delivery-audit table.** Server console logs are the instrumentation layer (accepted in questioning; matches Parked "Observability beyond minimum delivery logging").
- **No date library.** Reuses `src/lib/calendar.ts` (`formatDate`, `parseDate`, `isPastSlot`).
- **No automated tests.** Consistent with S-01/S-02/F-02; manual smoke is the verification layer.
- **No email/SMS notification.** Push only per PRD FR-012.
- **No custom install prompt on the confirm dialog.** F-02's `/install` page owns onboarding; users who haven't subscribed to push simply don't receive the fan-out (server logs will show `failed=<member_count>`).

## Implementation Approach

Three sequential phases, each independently landable and verifiable end-to-end. Phases mirror the S-02 / F-02 shape (schema → server → UI) which the codebase has now used three times.

**Phase 1** ships the `sessions` migration. Nothing user-visible, but the DB is the source of truth for the whole slice — landing it first means Phases 2 and 3 iterate against a live schema.

**Phase 2** ships the server: `getNextUpcomingSession` helper, `POST /api/groups/[id]/sessions` endpoint, and the fan-out call to `sendPushToUser`. Verifiable via `curl` end-to-end without any UI. This is where lesson §2 discipline matters most: the endpoint's `locals.user` + JS-level membership + admin client pattern must match S-02's exactly.

**Phase 3** ships the UI: `sessionInitial` propagates from `groups/[id].astro` to `<GroupCalendar>`; the banner renders SSR-side above the calendar; the long-press handler + shadcn `Dialog` provide the confirm affordance; on success the page reloads and everything re-renders from server state (no client state reconciliation needed — matches S-02's page-load-refresh convention).

## Critical Implementation Details

- **Concurrency: DB-level UNIQUE is the enforcement layer, not JS.** Two members hitting `POST /sessions` for the same slot at the same millisecond both pass the membership check and both attempt INSERT. Postgres serializes them via the UNIQUE constraint; the second gets error code `23505`. The endpoint must catch that specific SQL state and return 409 — not a generic 500. Any JS-side "is there already a session at this slot?" pre-check is a TOCTOU trap; skip it.
- **Slot-must-have-a-marker enforcement is a server-side spec check, not a UI enforcement.** The UI hints (long-press shows on cells with ≥1 marker), but a hand-rolled `curl` with a slot no one marked must be rejected. Server queries `availability` for the count-at-hour under the start-hour semantic (count of members whose `slot_hour <= body.slot_hour` for `slot_date`); if 0, return 400 `{error: "No members are available at this slot"}`.
- **`host_user_id` FK is composite, not to `auth.users`.** Reference `group_members(group_id, user_id)` via `(group_id, host_user_id)`. This mirrors `availability` and ensures a host row disappears if the host leaves the group (arguable but low-stakes for v1 — the session row cascades away with them, which matches "the group is these people right now"). If the host is deleted from `auth.users`, cascade continues through `group_members` cascade.
- **Fan-out iteration order.** Loop `group_members` rows sequentially (not `Promise.all`) so a slow/hung `web-push` call to one dead endpoint doesn't rate-limit or reorder others. F-02's `sendPushToUser` already loops internal endpoints; the outer loop just aggregates per-member stats. Small-group scale (≤10) makes serial fine.
- **`notification.tag: "session-<id>"`.** Setting a tag lets a repeated push for the same session replace the previous notification rather than stack, per Web Push spec. Useful defense if network hiccups cause the endpoint to be retried.
- **Long-press handler.** `onPointerDown` starts a `setTimeout(500)`; any `onPointerUp` / `onPointerCancel` / `onPointerLeave` before it fires cancels. If the timer fires, `preventDefault()` on the pointerup and open the dialog. Do NOT also fire the S-02 `toggle()` on that pointerup — the timer-vs-tap discrimination is the entire point. On cells the user long-presses but which have 0 markers, the dialog does not open (matches the "≥1 marker" affordance rule); the tap still counts as a normal availability toggle.

## Phase 1: `sessions` Schema + RLS Migration

### Overview

Add the `sessions` table with UNIQUE constraint, composite FK to `group_members`, and defense-in-depth RLS policies. Apply via Supabase CLI against the linked remote project.

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_sessions.sql` (produce timestamp with `date -u +%Y%m%d%H%M%S`)

**Intent**: Create `sessions` table backing S-03's confirm flow. Mirrors `availability`'s composite-FK-to-`group_members` shape so a leaving member deletes their hosted sessions in one cascade step. Enforces one session per (group, slot) at the DB layer. RLS policies are defense-in-depth against direct PostgREST traffic; the operative gate is the JS-level membership check in the endpoint.

**Contract**:
- Columns: `id uuid primary key default gen_random_uuid()`, `group_id uuid not null`, `host_user_id uuid not null`, `slot_date date not null`, `slot_hour smallint not null check (slot_hour between 0 and 23)`, `location text not null check (length(trim(location)) > 0)`, `confirmed_at timestamptz not null default now()`.
- Constraints: `unique (group_id, slot_date, slot_hour)`; composite FK `(group_id, host_user_id) references group_members(group_id, user_id) on delete cascade`.
- Index: `sessions_group_date_idx on (group_id, slot_date)` — supports the `next upcoming session` and `session at slot` queries.
- RLS enabled with three policies:
  - `sessions: members read` — SELECT to authenticated using `is_group_member(group_id)`
  - `sessions: host insert` — INSERT to authenticated with check `host_user_id = auth.uid() and is_group_member(group_id)`
  - No UPDATE, no DELETE policy → PostgREST denies both (defense-in-depth for the "no edit / no cancel" v1 rule)
- Follows the `availability` migration's comment structure (why the RLS policy exists, and the note that it's not the operative gate).

### Success Criteria

#### Automated Verification

- Migration file exists at `supabase/migrations/<timestamp>_sessions.sql`
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification

- Migration applied via `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl`
- Studio: `\d+ public.sessions` shows all columns, the UNIQUE constraint, the composite FK to `group_members`, the index, and RLS enabled
- Studio anon smoke: `select * from public.sessions` as anon (Studio SQL editor "role: anon") returns zero rows / permission denied — RLS defense holds
- Studio postgres smoke: manually INSERT a row for an existing group + member; verify UNIQUE violation on second identical INSERT (`ERROR: 23505`); rollback via `delete from public.sessions where id = '<id>'`
- `git log -- supabase/migrations/` shows the new migration as the audit trail

**Implementation Note**: After Phase 1 lands and manual verification passes, pause for confirmation before starting Phase 2.

---

## Phase 2: Endpoint + Fan-Out + Helper

### Overview

Add `src/lib/sessions.ts` with the read helper. Add `POST /api/groups/[id]/sessions` that validates + inserts + fans out. All auth via `locals.user` + admin + JS-level membership. Verifiable via `curl` before touching UI.

### Changes Required

#### 1. Session helper module

**File**: `src/lib/sessions.ts`

**Intent**: One SSR read helper for the banner (`getNextUpcomingSession`), and one shared `Session` type for the wire and SSR payload. Isolated so Phase 3 imports cleanly and future changes (list view, etc.) have a natural landing spot.

**Contract**:
- Export `interface Session { id: string; group_id: string; host_user_id: string; slot_date: string; slot_hour: number; location: string; confirmed_at: string; }`
- Export `interface SessionWithHost extends Session { host_email: string | null; }` — banner needs the host's email/label
- Export `async function getNextUpcomingSession(admin: SupabaseClient, groupId: string): Promise<SessionWithHost | null>` — query `sessions where group_id = $1 and slot_date >= today order by slot_date, slot_hour limit 1`; if a row is found, resolve host email via `admin.auth.admin.getUserById(row.host_user_id)`; return `{...row, host_email}` or `null`.
- `today` uses `formatDate(new Date())` from `src/lib/calendar.ts` so date semantics match availability everywhere.

#### 2. Confirm-session endpoint

**File**: `src/pages/api/groups/[id]/sessions.ts`

**Intent**: Accept a confirm request, validate slot + membership + spec constraints, insert one `sessions` row, and fan out one push per group member. Returns the created session on success; 409 on UNIQUE conflict; 400 on validation failures. Fan-out failures do NOT fail the request — the session is already confirmed, and the log line is the visibility surface.

**Contract**:
- Method: `POST` (export `POST: APIRoute`; other methods → 405 or Astro default)
- URL: `/api/groups/[id]/sessions`
- Request body: `{slot_date: string, slot_hour: number, location: string}`
- Auth preamble mirrors `src/pages/api/groups/[id]/availability/mark.ts:10-33` exactly (user → id → JSON parse → admin)
- Validation:
  - Missing/malformed body → 400
  - `slot_date` not `YYYY-MM-DD` or not parseable → 400
  - `slot_hour` not integer 0–23 → 400
  - `location` empty or all-whitespace → 400
  - Slot is in the past (`isPastSlot(slot_date, slot_hour)`) → 400
- Membership: JS-level `group_members` check via admin; not-a-member → 403
- Spec check: query `availability` for count of markers at that slot under the start-hour semantic (`select user_id from availability where group_id = $1 and slot_date = $2 and slot_hour <= $3`); if 0 → 400 `{error: "No members are available at this slot"}`
- INSERT into `sessions` with `host_user_id = user.id`; trim location before insert
- On `23505` UNIQUE violation → 409 `{error: "A session is already confirmed at this slot"}`
- On other insert error → 500
- Fan-out: SELECT `user_id` from `group_members WHERE group_id = $1` → loop sequentially → `sendPushToUser(admin, memberId, payload)` where payload is `{title: "Session confirmed", body: "<formatted slot> · <trimmed location>", url: '/groups/' + id, tag: 'session-<session.id>'}`; aggregate `sent/failed/deleted` across members
- Log summary line: `console.log("session", session.id, "→ fanout: sent=" + total.sent, "failed=" + total.failed, "deleted=" + total.deleted)`
- Fan-out errors are caught and logged (`console.warn`), never surfaced to the caller (session is already committed)
- Response: `json(200, {ok: true, session})` where `session` is the freshly inserted row

#### 3. Slot label helper (shared with UI)

**File**: `src/lib/calendar.ts` (extend existing)

**Intent**: Add a single helper `formatSlotLabel(slot_date: string, slot_hour: number): string` that both the server (push body) and client (dialog + banner) use to produce the human-readable slot string, so the push body matches what the user sees. Something like `"Sat, Oct 3 · 7pm"`.

**Contract**: One exported pure function. No new deps.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- Files exist: `src/lib/sessions.ts`, `src/pages/api/groups/[id]/sessions.ts`, and `formatSlotLabel` exported from `src/lib/calendar.ts`

#### Manual Verification

- `curl -X POST` with a signed-in session cookie (captured from browser) against a real group + a slot with ≥1 marker + valid location returns `{ok: true, session: {...}}`; row visible in Studio
- Server logs (Vercel Preview or `npm run dev`) show `session <id> → fanout: sent=<n> failed=<n> deleted=<n>` after the confirm
- Real push notification lands on both iOS PWA and Android PWA of the host (own devices) within seconds — tab closed
- Second `curl` with the same body returns 409 `{error: "A session is already confirmed at this slot"}`
- `curl` with `slot_date` in the past → 400
- `curl` with empty `location` → 400
- `curl` with a slot no one has marked → 400 with the "No members are available at this slot" error
- `curl` as an unauthenticated user (no cookies) → 401
- `curl` as a signed-in user who is NOT a member of the group → 403
- `getNextUpcomingSession(admin, groupId)` in an Astro page returns the confirmed row + host email; returns `null` for a group with no future sessions

**Implementation Note**: After Phase 2 lands and manual verification passes, pause for confirmation before starting Phase 3.

---

## Phase 3: UI — Banner, Confirm Dialog, Cell Badge

### Overview

Extend `groups/[id].astro` to fetch and propagate the next session. Render the banner SSR-side above the calendar. Install shadcn `dialog`. Extend `GroupCalendar.tsx` with a `confirmedSession` prop (drives cell badge), a long-press handler (opens dialog), and integrate `<ConfirmSessionDialog>`. On success, `window.location.reload()` — banner + cell badge re-render from SSR truth.

### Changes Required

#### 1. Install shadcn dialog primitive

**File**: `src/components/ui/dialog.tsx` (created by CLI)

**Intent**: Add the shadcn `dialog` component so the confirm affordance has a proper accessible modal. First use of `dialog` in this repo; sets the pattern for any future v1 modal.

**Contract**: `npx shadcn@latest add dialog`. Verify `radix-ui`'s dialog primitive is either bundled or installed. No hand-edits to the generated file unless the CLI produces a version that breaks build.

#### 2. Extend Astro group page with `sessionInitial`

**File**: `src/pages/groups/[id].astro`

**Intent**: Fetch `nextSession` server-side (right next to `calendarInitial`), render a banner block above the calendar when one exists, and pass the session into `<GroupCalendar>` for cell-badge rendering. Follows the existing "prepare data, render, pass down" order.

**Contract**:
- Import `getNextUpcomingSession, type SessionWithHost` from `@/lib/sessions`
- Import `formatSlotLabel` from `@/lib/calendar`
- After the `calendarInitial` block, fetch `nextSession: SessionWithHost | null = await getNextUpcomingSession(admin, group.id)` inside a try/catch (non-fatal, same shape as `calendarInitial`)
- Render a new "Next session" card above the calendar mount, only when `nextSession` is non-null: shows `formatSlotLabel(nextSession.slot_date, nextSession.slot_hour)`, `nextSession.location`, and "Hosted by <host_email or 'a member'>"; visual style matches the existing "Members" and "Invite link" cards (`rounded-2xl border border-white/10 bg-white/10`, gradient heading, etc.)
- Pass `nextSession` to `<GroupCalendar>` as a new optional prop `confirmedSession`

#### 3. Extend `<GroupCalendar>` with cell badge + long-press

**File**: `src/components/GroupCalendar.tsx`

**Intent**: Add cell badge rendering on the confirmed slot's cell and wire a long-press handler that opens `<ConfirmSessionDialog>`. Preserves S-02's tap-to-toggle behavior — long-press is a *second* gesture, discriminated by 500ms hold. Adds a small hint line below the grid explaining both gestures.

**Contract**:
- New prop: `confirmedSession?: { slot_date: string; slot_hour: number } | null`
- New local state: `dialogSlot: { slot_date: string; slot_hour: number } | null` — non-null opens the dialog
- Long-press handler: `onPointerDown` starts a 500ms `setTimeout`; `onPointerUp` / `onPointerCancel` / `onPointerLeave` cancels; if timer fires, mark a `ref` so the trailing `onPointerUp` skips the `toggle()` call and instead sets `dialogSlot`
- Long-press only opens the dialog for cells that (a) are not `isPastSlot()` AND (b) have `countAt(date, hour) >= 1`
- Cell rendering: when `confirmedSession?.slot_date === date && confirmedSession?.slot_hour === hour`, overlay a small badge (e.g., a ✓ icon or a filled circle in a distinct color) on top of the existing "N/M" count. Use an accessible pattern (`aria-label="Session confirmed"`)
- Below the grid, add one line of hint text: `Tap to mark availability · Long-press a slot to confirm a session` (styled `text-xs text-blue-100/50`)
- Render `<ConfirmSessionDialog>` inline; pass `slot={dialogSlot}`, `groupId`, and callbacks `onCancel={() => setDialogSlot(null)}` and `onConfirmed={() => window.location.reload()}`

#### 4. New `<ConfirmSessionDialog>` component

**File**: `src/components/ConfirmSessionDialog.tsx`

**Intent**: Modal that collects the location and issues the confirm POST. Reads slot info from props (calendar owns state). On success, calls `onConfirmed` (which reloads). On failure, shows an inline error inside the dialog and keeps it open so the user can retry.

**Contract**:
- Props: `{ groupId: string; slot: {slot_date: string; slot_hour: number; countAtSlot: number; groupSize: number} | null; onCancel: () => void; onConfirmed: () => void; }`
- Open state derived from `slot !== null`
- Uses shadcn `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`
- Body: read-only slot summary line (`formatSlotLabel(slot.slot_date, slot.slot_hour)` + `<countAtSlot>/<groupSize> available`), one shadcn `Input` for location, one `<label>` for accessibility, one Cancel + one Confirm button
- Confirm handler: POST to `/api/groups/${groupId}/sessions` with `{slot_date, slot_hour, location: input.trim()}`; on 2xx call `onConfirmed`; on non-2xx read `{error}` and show it inside the dialog (small red text pattern reused from `SignInForm`)
- Confirm button disabled while location is empty/whitespace and while POST is inflight
- Input auto-focus on open (dialog primitive handles it, but verify)

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- Files exist: `src/components/ui/dialog.tsx`, `src/components/ConfirmSessionDialog.tsx`
- `groups/[id].astro` imports `getNextUpcomingSession` and passes `confirmedSession` to `<GroupCalendar>`
- `GroupCalendar.tsx` receives `confirmedSession` prop and renders `<ConfirmSessionDialog>`

#### Manual Verification

- On Vercel Preview, member A opens `/groups/<id>` with no confirmed session — no banner renders; calendar hint line shows below the grid
- Member A long-presses a future cell with ≥1 marker → dialog opens with slot summary + empty Input
- Empty location → Confirm button disabled
- Enter "Anna's place" → Confirm → dialog closes, page reloads, banner shows "Next session: <slot label> · Anna's place · Hosted by <email>", confirmed cell shows the badge
- Member A's iOS PWA and Android PWA both receive the push within seconds of confirm (tab closed on the non-confirming device)
- Member B (second Google account, joined the same group, subscribed on iOS) receives the push
- Tapping the notification opens `/groups/<id>` and the banner is visible
- Long-press on a past cell → dialog does NOT open (past cells stay disabled)
- Long-press on a future cell with 0 markers → dialog does NOT open
- Tap (short) on a future cell still toggles availability (S-02 behavior preserved)
- Confirm attempt on an already-confirmed slot (member B tries the same slot after member A confirmed) → dialog shows the 409 error inline, stays open, does NOT reload
- Confirm with only whitespace as location (bypassing the disabled button via keyboard) → server rejects with 400, dialog shows the error
- Member B unmarks their availability at the confirmed slot → unmark succeeds silently; banner is unchanged
- Banner shows only the earliest future session even if a second session is confirmed at a later slot
- Confirm one session, then confirm a second session at a later slot in the same group → banner still shows only the earlier one; both rows visible in Studio
- Server logs on Vercel show one `session <id> → fanout: sent=X failed=Y deleted=Z` line per confirm
- Lighthouse PWA audit still passes on the group page (no regression from F-02)
- Tag production deploy as `prod-<date>-s03` after production smoke passes

**Implementation Note**: After Phase 3 lands and all manual verification passes, this slice is complete and eligible for `/10x-impl-review`.

---

## Testing Strategy

### Manual Testing Steps

1. **Two-account, two-device end-to-end** — Google account A on iOS PWA + Google account B on Android PWA, both subscribed to push. A creates or joins a group; both mark availability at some overlapping slot; A confirms; both devices receive the push. Repeat with role swap (B confirms, A receives).
2. **Concurrency probe** — open two tabs in one browser signed in as different accounts (or two devices), long-press the same slot at the same time; the first Confirm wins with 200, the second gets 409 with the dialog showing the error inline.
3. **iOS push flakiness stress** — force-close the PWA on iOS, wait 24 hours, have B confirm a session; iOS should still deliver the push. If not, `pushsubscriptionchange` should recover the subscription on next open (F-02 territory but re-exercised here). Server log's `failed` counter is the visibility.
4. **Unmark-after-confirm** — after a session is confirmed, the confirming host and another member both attempt to unmark their availability at the confirmed slot; both succeed; banner unchanged.
5. **Edge cases** — empty location (button disabled + server 400); whitespace-only location (server 400); confirm past slot (dialog doesn't open; direct `curl` returns 400); confirm slot with 0 markers (dialog doesn't open; direct `curl` returns 400).

## Performance Considerations

Friend-group scale (`target_scale.users: small`, ≤10 per group) makes per-request performance a non-concern. The single `POST /sessions` request does:

- 1 SELECT (membership)
- 1 SELECT (availability count at slot)
- 1 INSERT (sessions)
- 1 SELECT (group members for fan-out)
- N `web-push` calls where N = group members ≤ 10 (each fan-out is 1 SELECT for push_subscriptions rows + up to K `webpush.sendNotification` calls)

Well under Vercel's 300s function default. No caching needed; no read replicas needed.

## Migration Notes

- Applies cleanly on top of the four existing migrations (`groups_and_members`, `availability`, `availability_start_hour_semantic`, `push_subscriptions`). No dependencies except the presence of `group_members` (composite PK) and `is_group_member()` SECURITY DEFINER from `groups_and_members`.
- Rollback (unlikely to be needed but easy): `drop table public.sessions` then `git revert` the migration file. No cross-table triggers to unwind.
- No data migration — new table starts empty.

## References

- PRD: `context/foundation/prd.md` — FR-009, FR-010, FR-011, FR-012, US-01 (Then clause), Open Q #2 (unmark-after-confirm, resolved here), Non-Goals (no session history, no cancellation)
- Roadmap: `context/foundation/roadmap.md#S-03` — north star, Prerequisites S-02 + F-02 (both done)
- Lessons: `context/foundation/lessons.md` §2 (PostgREST auth.uid() broken → app-layer auth gate) and §5 (migrations via CLI only)
- Prior slice: `context/archive/2026-06-04-mark-availability-with-overlap/plan.md` — auth pattern, endpoint shape, calendar mount pattern
- Prior slice: `context/archive/2026-07-21-pwa-shell-and-push-delivery/plan.md` — push helper contract, subscription table shape
- Availability helper: `src/lib/availability.ts:31` — `getAvailabilityWindow` signature
- Push helper: `src/lib/push.ts` — `sendPushToUser`, `PushPayload`, `SendResult`
- Group page mount: `src/pages/groups/[id].astro:82-95` (calendar SSR prep) and `:197-199` (mount)
- Endpoint template: `src/pages/api/groups/[id]/availability/mark.ts:10-33` (auth preamble)
- Migration template: `supabase/migrations/20260604180213_availability.sql` (composite FK + defense-in-depth RLS)
- SW notification: `public/sw.js` — `push` and `notificationclick` handlers (already handle `payload.url`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: `sessions` Schema + RLS Migration

#### Automated

- [x] 1.1 Migration file exists at `supabase/migrations/<timestamp>_sessions.sql` — dba3ac5
- [x] 1.2 `npm run typecheck` passes — dba3ac5
- [x] 1.3 `npm run lint` passes — dba3ac5
- [x] 1.4 `npm run build` succeeds — dba3ac5

#### Manual

- [x] 1.5 Migration applied via `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl` — dba3ac5
- [x] 1.6 Studio `\d+ public.sessions` shows all columns, UNIQUE, composite FK to `group_members`, index, and RLS enabled — dba3ac5
- [x] 1.7 Studio anon smoke: `select * from public.sessions` as anon returns permission denied / zero rows — dba3ac5
- [x] 1.8 Studio postgres smoke: manually INSERT one row; second identical INSERT raises `23505`; rollback via `delete` — dba3ac5
- [x] 1.9 `git log -- supabase/migrations/` shows the new file as the audit trail — dba3ac5

### Phase 2: Endpoint + Fan-Out + Helper

#### Automated

- [x] 2.1 `npm run typecheck` passes — 3d79fd9
- [x] 2.2 `npm run lint` passes — 3d79fd9
- [x] 2.3 `npm run build` succeeds — 3d79fd9
- [x] 2.4 Files exist: `src/lib/sessions.ts`, `src/pages/api/groups/[id]/sessions.ts`, `formatSlotLabel` exported from `src/lib/calendar.ts` — 3d79fd9

#### Manual

- [x] 2.5 `curl -X POST` (signed-in cookies) with valid body returns `{ok:true, session:{...}}`; row visible in Studio — 3d79fd9
- [x] 2.6 Server logs show `session <id> → fanout: sent=<n> failed=<n> deleted=<n>` after the confirm — 3d79fd9
- [x] 2.7 Real push arrives on host's iOS + Android PWAs (tab closed) within seconds — 3d79fd9
- [x] 2.8 Second identical `curl` returns 409 `{error: "A session is already confirmed at this slot"}` — 3d79fd9
- [x] 2.9 `curl` with `slot_date` in the past → 400 — 3d79fd9
- [x] 2.10 `curl` with empty `location` → 400 — 3d79fd9
- [x] 2.11 `curl` with a slot no one has marked → 400 with "No members are available at this slot" — 3d79fd9
- [x] 2.12 Unauthenticated `curl` → 401; non-member → 403 — 3d79fd9
- [x] 2.13 `getNextUpcomingSession(admin, groupId)` invoked from a scratch Astro page returns the confirmed row + host email; returns `null` when no future session exists — 3d79fd9

### Phase 3: UI — Banner, Confirm Dialog, Cell Badge

#### Automated

- [x] 3.1 `npm run typecheck` passes — 2ee29b5
- [x] 3.2 `npm run lint` passes — 2ee29b5
- [x] 3.3 `npm run build` succeeds — 2ee29b5
- [x] 3.4 Files exist: `src/components/ui/dialog.tsx`, `src/components/ConfirmSessionDialog.tsx` — 2ee29b5
- [x] 3.5 `groups/[id].astro` imports `getNextUpcomingSession` and passes `confirmedSession` to `<GroupCalendar>` — 2ee29b5

#### Manual

- [ ] 3.6 Fresh group with no confirmed session: no banner; calendar hint line renders below the grid
- [ ] 3.7 Confirm ✓ button appears at the right of a day row whenever host has marked that day; clicking opens the dialog with slot=(day, host's start-hour) + empty Input; Confirm disabled until non-empty location
- [ ] 3.8 Successful confirm → dialog closes, page reloads, banner shows slot + location + host, confirmed cell shows the badge
- [ ] 3.9 Host's iOS PWA + Android PWA both receive the push within seconds (tab closed on non-confirming device)
- [ ] 3.10 Second member (different Google account, iOS PWA) receives the push; tapping opens `/groups/<id>` with banner visible
- [ ] 3.11 Confirm ✓ button is hidden on days whose host start-hour is in the past (no accidental past-day confirms)
- [ ] 3.12 Confirm ✓ button is hidden on days the host hasn't marked yet (no slot picker; the button is the entire affordance)
- [ ] 3.13 Tap on a future cell still toggles availability (S-02 behavior preserved and unaffected by the confirm column)
- [ ] 3.14 Second member attempting to confirm the same slot → dialog shows inline 409 error, does NOT reload
- [ ] 3.15 Second member unmarking their availability at the confirmed slot → unmark succeeds; banner unchanged
- [ ] 3.16 With two future sessions confirmed at different slots, banner shows only the earlier one
- [ ] 3.17 Server logs on Vercel show one fanout summary line per confirm
- [ ] 3.18 Lighthouse PWA audit passes on the group page (no regression from F-02)
- [ ] 3.19 Production smoke passes at `https://10xdevs-lilac.vercel.app`
- [ ] 3.20 Tag production deploy as `prod-<date>-s03`
