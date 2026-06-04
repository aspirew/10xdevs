# Mark Availability with Overlap Surfacing — Implementation Plan

## Overview

Land the wedge slice of GameSlot: group members tap day+hour cells on a shared calendar to mark/unmark availability, and the calendar surfaces per-slot counts plus a visual highlight on slots where `⌈group_size × 2/3⌉` or more members are available. Closes PRD FR-005, FR-006, FR-007, FR-008 and the "Given" clause of US-01. Inherits S-01's app-layer-auth posture (service-role admin client + `Astro.locals.user` gate, RLS as defense-in-depth) because PostgREST `auth.uid()` is broken on this Supabase project (`lessons.md` #2).

## Current State Analysis

- **Schema:** `groups` + `group_members` (composite PK) exist with `is_group_member(g uuid)` SECURITY DEFINER helper. No availability table yet. `supabase/migrations/20260601210816_groups_and_members.sql` is the only migration.
- **Auth gate:** `src/middleware.ts:1-26` populates `Astro.locals.user`; `PROTECTED_ROUTES = ["/groups"]` (covers all `/groups*`). S-01's endpoints document that PostgREST rejects authenticated JWTs on this asymmetric-JWT project, so all mutations go through `createAdminClient()` (`src/lib/supabase-admin.ts:9-16`) with the app trusting `locals.user`.
- **API patterns:** S-01's endpoints (`src/pages/api/groups/index.ts`, `.../[id]/regenerate-invite.ts`) are form-encoded POST → 302 redirect. S-02's mark/unmark are tap-to-toggle in a React island, so they will use JSON-in/JSON-out — the first JSON-style endpoint in the project.
- **UI:** All current pages are server-rendered Astro with at-top auth guards; the auth flow uses one React island (`src/components/auth/SignInForm.tsx`). No date library, no calendar primitive, no tests, no type generation. shadcn primitives present: `button`, `card`, `input`, `label`.
- **Tech-stack constraints:** Astro 6 + React 19 + Tailwind 4; `@astrojs/vercel` adapter; Supabase CLI 2.23.4 in devDeps; `astro check` (typecheck) and `eslint .` are the only quality gates. No vitest/playwright.

### Key Discoveries

- `is_group_member()` is already in place and idempotent for reuse in new RLS policies — copy the pattern from `supabase/migrations/20260601210816_groups_and_members.sql`.
- The composite PK shape `(group_id, user_id)` of `group_members` lets us add an `FK (group_id, user_id) REFERENCES group_members(group_id, user_id) ON DELETE CASCADE` to the availability table, so a member leaving auto-cleans their marks.
- The 4-week × 24-hour window × ≤10 members upper bound puts the worst-case row count under ~7k — aggregate-on-read is comfortably cheap with a `(group_id, slot_date)` index.
- "Mobile-first" NFR makes a 4-week × 24-hour grid hard to fit on a phone. The data model allows any hour, but the UI should default to an evening-hours window (decided at implementation time based on a real phone test).

## Desired End State

A signed-in group member opens `/groups/<id>` and sees a 4-week calendar grid under the existing Members + Invite sections. Tapping any future (day, hour) cell toggles their availability. The cell shows "N/M" (members available / group size); cells where N ≥ `⌈M × 2/3⌉` get a colored background + ring. Prev/Next-week buttons (and a "Today" jump) slide the visible 4-week window; backward navigation shows past slots read-only. A second member, signed in on another browser, sees the first member's marks after refresh / nav. RLS policies are in place as defense-in-depth (won't actually gate authenticated traffic, but block direct PostgREST attacks with a stolen publishable key).

## What We're NOT Doing

- **No session confirmation** — S-03 territory. No `sessions` table; no `confirmed_session_id` column on availability (punted; S-03 may add one ALTER).
- **No real-time updates** — others' marks become visible only on page load / nav. No Supabase Realtime subscription.
- **No drag-to-select** — single-tap toggle only.
- **No notifications** — F-02 + S-03 territory.
- **No tests** — repo has no test runner and adding one is out of scope per the same reasoning S-01 used.
- **No PostgREST re-verification** at Phase 1 — user explicitly chose to skip per lessons.md #2 (fresh lesson, recorded as accepted risk in the brief).
- **No type generation** — repo doesn't use `supabase gen types`; types stay hand-written where needed.
- **No date library** — native `Date` + a small `src/lib/calendar.ts` helper module is enough for the bounded operations.
- **No leave-group / delete-group UI changes** — neither is in scope, even though availability FK-cascades on leave.
- **No public profile / member-name display beyond what S-01 ships** — overlap counts use anonymous counts ("3/5"), not name lists.

## Implementation Approach

Three phases, each delivering a vertical slab:

1. **Migration** — single new file with the `availability` table, one supporting index, RLS policies that copy S-01's `is_group_member()` shape. Applied via `npx supabase db push --linked` against the consolidated project (`dchurjcpgzuoyunjsokl`) per `lessons.md` "Apply Supabase migrations via the CLI…".
2. **Endpoints + read helper** — one shared `src/lib/availability.ts` data-access module used by both the server-render path (`groups/[id].astro`) and the JSON `GET` endpoint (for week navigation). Two JSON `POST` endpoints for mark and unmark, both reading body as JSON and returning JSON.
3. **Calendar React island** — new `GroupCalendar.tsx` (`client:load`) mounted inside the existing `groups/[id].astro` page. Owns the window state, optimistic toggle, week nav. Past slots disabled. Single-color highlight + count badge.

The app-layer auth pattern is non-negotiable: every endpoint and the server-render path check `locals.user` and then verify group membership with an **explicit JS-level query** against `group_members` before reading or writing — *not* via the SQL helper `is_group_member()`. The helper internally calls `auth.uid()` (broken on this project per `lessons.md` #2); when invoked from the service-role admin client, it returns false unconditionally. S-01 already established the JS-level pattern (`src/pages/groups/[id].astro:49-54`, `src/pages/api/groups/[id]/regenerate-invite.ts:23-39`) — copy it. The RLS policies on `availability` keep using `is_group_member()` because they only fire against direct PostgREST traffic (anonymous publishable-key attacks), where the helper's behavior doesn't matter — that traffic never has a user identity to begin with.

## Critical Implementation Details

- **User experience spec.** PRD §NFR locks "mobile-first usability." A full 24-hour × 28-day grid will not fit a phone. The implementer should pick a sensible default *visible* hour range (e.g., 8am–midnight = 16 columns) at build time based on testing the rendered grid on a real phone, and leave the data model unconstrained — hours 0–23 remain insertable. This is a deliberate decision deferred to implementation rather than the plan, because the right answer is one screenshot away on a phone.
- **Past-slot boundary (UI-only).** "Past" = `slot_date < today` OR (`slot_date = today` AND `slot_hour < currentHour`), computed in the browser using local `Date`. The UI renders past cells at 50% opacity and ignores taps. Server-side mutation endpoints do **not** validate past-ness: Supabase Postgres + Vercel functions run in UTC, but the user is in their browser-local TZ (PRD §Access Control locks "single TZ per group" but does not store one). Trying to enforce past in the server would be wrong by the UTC offset and would reject legitimate user actions near midnight. Accepted v1 trade: the UI is the gate; a curl-wielder marking past slots is silly and harmless (the row sits in `availability`, doesn't affect anyone else's overlap counts for future slots). RLS policies still exist as defense-in-depth on direct PostgREST traffic.
- **Optimistic UI revert.** Tap-to-toggle updates the React state immediately and POSTs in the background. On a non-2xx response: revert the cell's state to its pre-tap value, briefly tint the cell with a red ring for ~2s (Tailwind: `ring-2 ring-red-500` toggled via a per-cell `failedAt` timestamp in state, cleared after 2s), and `console.warn(error.message)` for developer visibility. No toast component install — matches the inline error treatment at `src/pages/groups/[id].astro:88-98`. This is the only place in the plan where ordering matters.
- **Membership check shape (lessons.md #2 follow-on).** Every admin-client query that reads or writes group-scoped data MUST do an explicit JS-level membership check against `group_members` BEFORE the read/write. Do NOT use the `is_group_member()` SQL helper from admin paths — it calls `auth.uid()` which returns NULL under service-role JWT, so the helper returns false unconditionally and the query yields zero rows. The RLS policies on `availability` keep referencing the helper because their job is to deny direct PostgREST anonymous traffic, where there's no user identity anyway.
- **Start-hour semantic (corrected mid-Phase-3, 2026-06-04).** PRD FR-006 ("day + start-hour slot") + §Business Logic intent: ONE mark per member per day, with availability lasting from `slot_hour` to end-of-day. Overlap at any (date, hour) cell = members whose `start_hour ≤ hour` on that date — cumulative, not exact-match. Phase 1's original PK `(group_id, user_id, slot_date, slot_hour)` modeled exact-match instead and was corrected by migration `20260604190001_availability_start_hour_semantic.sql` (PK → `(group_id, user_id, slot_date)`; test-only data truncated). Mark endpoint = upsert replace-on-conflict by date; unmark endpoint = delete by `(group_id, user_id, slot_date)` (`slot_hour` not part of the where clause). UI toggle: tap unmarked → mark as start; tap your own start → unmark for the day; tap a different hour on a marked day → move start. Visual color separation: **blue = YOU** (your start + your range to end-of-day), **purple = GROUP overlap met** (FR-008 wedge signal). S-03 must read this section before referencing the table — the load-bearing semantic differs from the original Phase 1 contract above.

## Phase 1: Schema + RLS Migration

### Overview

Add the `availability` table with its composite PK, the `(group_id, slot_date)` index for the aggregate-on-read query, and three RLS policies (SELECT / INSERT / DELETE) mirroring the shape S-01 established. Apply the migration to the consolidated Supabase project.

### Changes Required:

#### 1. New migration file

**File**: `supabase/migrations/<timestamp>_availability.sql` (generate via `npx supabase migration new availability`)

**Intent**: Add the availability table backing FR-005/006/007/008 plus its RLS policies. Copy the `is_group_member()` shape from the prior migration verbatim — same `to authenticated`, same `using (is_group_member(group_id))` form for SELECT, same `with check (user_id = auth.uid() AND is_group_member(group_id))` for INSERT, same `using (user_id = auth.uid())` for DELETE. The composite FK to `group_members(group_id, user_id)` ON DELETE CASCADE auto-cleans availability when a member leaves a group.

**Contract**:

```sql
create table availability (
  group_id   uuid     not null,
  user_id    uuid     not null,
  slot_date  date     not null,
  slot_hour  smallint not null check (slot_hour between 0 and 23),
  marked_at  timestamptz not null default now(),
  primary key (group_id, user_id, slot_date, slot_hour),
  foreign key (group_id, user_id)
    references group_members(group_id, user_id) on delete cascade
);

create index availability_group_date_idx on availability (group_id, slot_date);

alter table availability enable row level security;

create policy "availability: members read"
  on availability for select to authenticated
  using (is_group_member(group_id));

create policy "availability: self mark"
  on availability for insert to authenticated
  with check (user_id = auth.uid() and is_group_member(group_id));

create policy "availability: self unmark"
  on availability for delete to authenticated
  using (user_id = auth.uid());
```

### Success Criteria:

#### Automated Verification:

- Migration file exists at `supabase/migrations/<timestamp>_availability.sql`
- `npx supabase db diff --linked` (or studio-side `\d availability`) shows the four columns + composite PK + index + 3 policies as expected
- `npm run typecheck` passes (no changes to TS yet — sanity check)
- `npm run lint` passes

#### Manual Verification:

- Applied successfully via `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl` (per `lessons.md` "Apply Supabase migrations via the CLI…")
- `\d+ availability` in Studio shows the FK to `group_members(group_id, user_id)` with `ON DELETE CASCADE`
- A direct postgres-role INSERT from Studio SQL editor for a (group, user) tuple that IS a member succeeds; one that ISN'T a member fails with FK violation (validates the composite FK)
- Selecting `availability` in Studio via the publishable key as anonymous role returns zero rows (RLS is enabled and denies anonymous)

**Implementation Note**: After Phase 1's automated checks pass and the manual verification has been done in Studio, pause for confirmation before moving to Phase 2. Phase 2 depends on the migration being live in the linked project.

---

## Phase 2: Endpoints + Read Helper

### Overview

Add a shared data-access helper that returns window data + my-marks + group size + threshold, and three thin endpoints around it. The helper is used directly by `groups/[id].astro` for initial server render and indirectly via the GET endpoint for client-side week nav. All three endpoints check `locals.user` and verify group membership before reading or writing.

### Changes Required:

#### 1. Shared availability helper

**File**: `src/lib/availability.ts` (new)

**Intent**: One pure data-access function used by both server-render and client-fetch paths. Bundles the four facts the calendar needs (overlap counts, my own marks, group size, computed threshold) into one round-trip so the React island doesn't have to make three calls. Takes an admin Supabase client (caller's responsibility — the helper never decides the auth model).

**Contract**:

```ts
// Signature only; implementer writes the queries.
export type AvailabilityWindow = {
  slots: Array<{ slot_date: string; slot_hour: number; count: number }>;
  myMarks: Array<{ slot_date: string; slot_hour: number }>;
  groupSize: number;
  threshold: number; // ceil(groupSize * 2 / 3)
};

export async function getAvailabilityWindow(
  admin: SupabaseClient,
  groupId: string,
  userId: string,
  startDate: string, // 'YYYY-MM-DD' inclusive
  endDate: string,   // 'YYYY-MM-DD' inclusive
): Promise<AvailabilityWindow>;
```

The query for `slots` is the FR-008 aggregate: `select slot_date, slot_hour, count(*)::int from availability where group_id = $1 and slot_date between $2 and $3 group by slot_date, slot_hour`. `myMarks` is a narrow `select slot_date, slot_hour from availability where group_id = $1 and user_id = $2 and slot_date between $2 and $3`. `groupSize` is `select count(*)::int from group_members where group_id = $1`. Threshold is computed in JS.

#### 2. Calendar window helper

**File**: `src/lib/calendar.ts` (new)

**Intent**: Tiny pure helpers for date math the calendar UI and endpoints need — no library install. Each function is one-liner-ish: format a Date as `YYYY-MM-DD`, parse `YYYY-MM-DD` back to Date, add N days, build a 28-day window starting at a date, compute "is past" for (slot_date, slot_hour) against current time.

**Contract**: exported functions `formatDate(d: Date): string`, `parseDate(s: string): Date`, `addDays(d: Date, n: number): Date`, `buildWindow(start: Date, days: number): Date[]`, `isPastSlot(slotDate: string, slotHour: number, now?: Date): boolean`.

#### 3. GET availability window (for week nav)

**File**: `src/pages/api/groups/[id]/availability.ts` (new — handles `GET` only in this file)

**Intent**: Return the window payload for a navigated date range. Used by the React island on Prev/Next/Today clicks. The server-render path does NOT call this endpoint — it calls `getAvailabilityWindow` directly with the admin client. Auth gate identical to S-01 endpoints.

**Contract**: `GET /api/groups/[id]/availability?start=YYYY-MM-DD&end=YYYY-MM-DD`. Auth: `locals.user` required (401 if absent). Membership: verified via explicit JS-level query — `await admin.from("group_members").select("user_id").eq("group_id", id).eq("user_id", user.id).maybeSingle()`; 403 if no row. Date params: validated as ISO date strings; reject (400) if range > 31 days or `end < start`. Response: 200 with the `AvailabilityWindow` JSON shape from helper #1. Errors: 4xx with `{ error: string }`.

#### 4. POST mark

**File**: `src/pages/api/groups/[id]/availability/mark.ts` (new)

**Intent**: Insert one (group_id, user_id, slot_date, slot_hour) tuple. `ON CONFLICT DO NOTHING` makes the operation idempotent against double-clicks. Reject mutations of past slots (defensive).

**Contract**: `POST /api/groups/[id]/availability/mark` body `{ slot_date: string, slot_hour: number }`. Auth + membership as above. Reject malformed `slot_date` (non-ISO) or `slot_hour` outside 0..23 (400). **No past-slot validation server-side** (see Critical Implementation Details — UI-only). On success: 200 `{ ok: true }`. On failure: 4xx `{ error: string }`.

#### 5. POST unmark

**File**: `src/pages/api/groups/[id]/availability/unmark.ts` (new)

**Intent**: Delete one tuple by composite key. Idempotent: deleting a non-existent row returns 200 ok.

**Contract**: `POST /api/groups/[id]/availability/unmark` body `{ slot_date: string, slot_hour: number }`. Auth + membership + body validation identical to mark (no past-slot check server-side). Response shape identical.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes — all new files type-clean against React 19 / Astro 6
- `npm run lint` passes
- New files at the four paths above; no edits to existing endpoint files

#### Manual Verification:

- With cookies of a member of a group on localhost, `curl -X POST -H "Content-Type: application/json" -d '{"slot_date":"2026-06-15","slot_hour":19}' http://localhost:4321/api/groups/<id>/availability/mark -b "<session-cookie>"` returns `{"ok":true}` and the row appears in Studio
- Repeating the same curl returns `{"ok":true}` (idempotent — no duplicate row)
- `curl … /availability/unmark` removes the row and returns `{"ok":true}`
- `curl …/availability?start=…&end=…` returns the expected shape with both `slots[]` and `myMarks[]` populated when there's at least one mark
- A second curl from a non-member's cookies on the same group ID returns 403 (membership check)
- A POST with malformed body (e.g., `slot_hour: 99` or `slot_date: "nope"`) returns 400

**Implementation Note**: Pause for confirmation before moving to Phase 3. The endpoints must be exercised by curl/Postman against localhost first; Phase 3 builds the UI on top of them and assumes they work.

---

## Phase 3: Calendar React Island

### Overview

Build the `<GroupCalendar />` React island and mount it on `/groups/[id].astro`. The page server-renders the initial window, hands data + groupId to the island, and lets the island own all interaction. Tap-to-toggle with optimistic UI; week nav via the GET endpoint; past slots disabled but visible.

### Changes Required:

#### 1. GroupCalendar island

**File**: `src/components/GroupCalendar.tsx` (new)

**Intent**: The interactive calendar grid. Internally tracks the current 4-week window, the per-slot counts, my marks, group size, and the threshold. On tap of a future cell: flip my-mark state locally, fire `POST .../mark` or `.../unmark`, revert on non-2xx. On Prev/Next/Today: fetch new window via `GET .../availability`, swap state on 200. Disabled past cells render but don't accept tap.

**Contract**: Props:

```ts
type Props = {
  groupId: string;
  initial: AvailabilityWindow;
  initialStart: string; // 'YYYY-MM-DD'
};
```

The component computes `initialEnd` = `initialStart + 27 days` and uses it as the window length forever (4 weeks fixed). Internal state holds `{ start: string; data: AvailabilityWindow }`. Visible-hour range is a local constant inside the component (see Critical Implementation Details — mobile UX).

Layout convention: rows = days (28), columns = visible hours (~16). Each cell shows `${count}/${groupSize}` when count > 0; otherwise empty. Cells where `count >= threshold` get a colored background + ring (Tailwind: e.g. `bg-purple-600/20 ring-1 ring-purple-400`). The current user's own marks get a distinct treatment (e.g., a `font-bold` or a corner dot) so the user always knows which cells are theirs. Past cells: `opacity-50 cursor-not-allowed`.

#### 2. Mount in group detail page

**File**: `src/pages/groups/[id].astro` (edit)

**Intent**: Inside the existing layout (under Members + Invite sections per S-01's plan), call the helper from #1 above and render the React island with `client:load`. The auth + membership guards already at the top of the file are reused unchanged — no new gates.

**Contract**: Add to the server-side script block (between current data-fetching and `---` close): build today's date string, call `getAvailabilityWindow(admin, groupId, userId, today, today+27d)`. In the body, render `<GroupCalendar groupId={...} initial={...} initialStart={...} client:load />` inside its own section after the Invite section.

#### 3. Small calendar styling sheet (optional)

**File**: any additions needed are kept in the `GroupCalendar.tsx` file as Tailwind classes — no separate CSS file. Adding a new CSS file is explicitly out of scope.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds (Astro build produces no warnings about missing components)
- No new top-level dependencies added to `package.json` (no date library, no calendar lib)

#### Manual Verification:

- Localhost: signed in as group creator, navigate to `/groups/<id>`, see the 4-week × visible-hour grid below the Invite section
- Tap a future cell → cell visually flips to "1/M" + own-mark treatment within ~16ms; network tab shows POST .../mark → 200
- Tap the same cell again → reverts to empty, POST .../unmark → 200
- Reload page → marks persist (proves DB write)
- Sign in as a second member in another browser (incognito) on the same group → see "1/M" on the cells the first member marked (proves the count aggregation)
- Mark same cell as second member → count becomes "2/M"; reload first member's page → first member also sees "2/M"
- For a 3-member group, mark same cell as 2 members → "2/3" is NOT highlighted (threshold = ⌈3 × 2/3⌉ = 2; HOLD — let's check the math)
  - Actually: `ceil(3 * 2/3) = ceil(2) = 2`, so 2/3 IS at threshold and gets highlighted. For a 4-member group, `ceil(4 * 2/3) = ceil(2.67) = 3`, so 3/4 highlights, 2/4 doesn't. Validate these two boundaries on real groups.
- Click Prev / Next / Today week-nav buttons → grid updates without full page reload; URL stays the same (window state is client-side only); spinner during fetch is acceptable
- Click "Prev" enough to reach a past week → cells in the past render at 50% opacity and tapping them does nothing (no network request)
- iOS Safari + Android Chrome smoke on a real phone: grid is usable, taps register, no horizontal-scroll trap (this is what locks the visible-hour-range decision)
- Production smoke (`https://10xdevs-lilac.vercel.app`): two-account test as above; everything works end-to-end

**Implementation Note**: Phase 3 is the largest. Recommend tagging the production deploy after Phase 3 manual verification passes (`prod-<date>-s02`) — gives S-03 a known-good rollback target like S-01 did.

---

## Testing Strategy

No automated tests are added (no test runner in the repo; consistent with S-01).

### Manual Testing Steps:

1. **Localhost happy path.** Sign in as a member, navigate `/groups/<id>`, tap a future cell, confirm "1/M" appears, reload, confirm persistence.
2. **Two-member overlap.** Two accounts on same group, both mark same future cell, confirm count = 2, confirm threshold-highlight behavior at the actual `ceil(2/3 × M)` boundary.
3. **Past-slot guard (UI).** Navigate back to a past week, confirm cells are 50% opacity and unresponsive to tap. (Server-side does not enforce past — UI is the gate. A direct curl POST for a past slot WILL succeed; this is the accepted trade.)
4. **Non-member denial.** Curl `GET …/availability` and `POST …/mark` with cookies of a user NOT in the group → 403.
5. **Idempotency.** Double-tap mark, confirm no duplicate row in Studio; double-tap unmark on non-existent, confirm 200 still.
6. **Mobile usability.** Open production on a phone, confirm grid is readable and tappable, decide whether the visible-hour range chosen at build time is the right one (adjust if needed before closing the plan).
7. **Production smoke.** Repeat step 1+2 against `https://10xdevs-lilac.vercel.app` with two real Google accounts.

## Performance Considerations

Read query: ~6700 rows worst-case (10 members × 28 days × 24 hours). The `availability_group_date_idx` covers the WHERE on (group_id, slot_date); the GROUP BY is a tiny in-memory aggregation at this size. No performance work needed at v1 scale.

Writes are single-row INSERT or DELETE by composite key — primary key handles uniqueness without serialization cost. Optimistic UI ensures perceived latency = 0 even on a slow connection; the actual POST is fire-and-forget unless it errors.

## Migration Notes

No data migration. The `availability` table starts empty. Pre-existing `groups` + `group_members` rows are untouched.

If a future schema change adds `confirmed_session_id` (per S-03), it will be one `ALTER TABLE availability ADD COLUMN confirmed_session_id uuid REFERENCES sessions(id)` — pre-shaping that column in this plan was explicitly declined (see "What We're NOT Doing").

## References

- Roadmap entry: `context/foundation/roadmap.md` § S-02
- PRD FRs: FR-005, FR-006, FR-007, FR-008 + Business Logic + Open Q #2
- S-01's plan (pattern source): `context/archive/2026-06-01-create-group-and-invite/plan.md`
- S-01's migration (RLS pattern + `is_group_member()`): `supabase/migrations/20260601210816_groups_and_members.sql`
- App-layer auth gate constraint: `context/foundation/lessons.md` § "Verify PostgREST honors `auth.uid()`…"
- Admin-client factory: `src/lib/supabase-admin.ts:9-16`
- Middleware + `locals.user` shape: `src/middleware.ts:1-26`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + RLS Migration

#### Automated

- [x] 1.1 Migration file exists at `supabase/migrations/<timestamp>_availability.sql` — a3a1a64
- [x] 1.2 `npx supabase db diff --linked` or Studio `\d availability` shows expected shape — a3a1a64
- [x] 1.3 `npm run typecheck` passes — a3a1a64
- [x] 1.4 `npm run lint` passes — a3a1a64

#### Manual

- [x] 1.5 Migration applied via `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl` — a3a1a64
- [x] 1.6 `\d+ availability` shows the composite FK to `group_members` with ON DELETE CASCADE — a3a1a64
- [x] 1.7 Postgres-role INSERT for a member tuple succeeds; non-member tuple fails with FK violation — a3a1a64
- [x] 1.8 Anonymous publishable-key SELECT on `availability` returns zero rows (RLS denies) — a3a1a64

### Phase 2: Endpoints + Read Helper

#### Automated

- [x] 2.1 `npm run typecheck` passes — 3a5f7d6
- [x] 2.2 `npm run lint` passes — 3a5f7d6
- [x] 2.3 Files exist at the four new paths (helper, calendar utils, GET endpoint, mark, unmark) — 3a5f7d6

#### Manual

- [x] 2.4 Localhost: member-cookie curl POST `.../mark` returns `{ok:true}`; row visible in Studio — 3a5f7d6
- [x] 2.5 Repeated mark curl returns `{ok:true}` (idempotent — no duplicate row) — 3a5f7d6
- [x] 2.6 Member-cookie curl POST `.../unmark` returns `{ok:true}`; row gone in Studio — 3a5f7d6
- [x] 2.7 Member-cookie curl GET `.../availability?start&end` returns expected JSON shape — 3a5f7d6
- [x] 2.8 Non-member-cookie curl on any endpoint returns 403 — 3a5f7d6
- [x] 2.9 Malformed-body mark/unmark returns 400 (no server-side past check; see plan note) — 3a5f7d6

### Phase 3: Calendar React Island

#### Automated

- [x] 3.1 `npm run typecheck` passes
- [x] 3.2 `npm run lint` passes
- [x] 3.3 `npm run build` succeeds with no warnings about missing components
- [x] 3.4 No new top-level dependencies added to `package.json`

#### Manual

- [x] 3.5 Localhost: signed in as member, `/groups/<id>` shows calendar below Invite
- [x] 3.6 Tap-to-mark: cell flips visually within ~16ms; POST .../mark → 200; persists across reload
- [x] 3.7 Tap-to-unmark: cell reverts; POST .../unmark → 200; persists across reload
- [x] 3.8 Two-account: second member sees first member's marks after reload/nav; count aggregates correctly
- [x] 3.9 Threshold highlight: at boundary `ceil(group_size × 2/3)` cells visually emphasized; below not
- [x] 3.10 Prev/Next/Today nav: grid updates without full reload; smooth transition
- [x] 3.11 Past-slot cells: 50% opacity, tap does nothing (no network request)
- [ ] 3.12 iOS Safari + Android Chrome smoke on a real phone: grid usable
- [ ] 3.13 Production smoke at `https://10xdevs-lilac.vercel.app` with two real Google accounts
- [ ] 3.14 Tag production deploy as `prod-<date>-s02` after success
