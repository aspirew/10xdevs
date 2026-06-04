# Mark Availability with Overlap Surfacing — Plan Brief

> Full plan: `context/changes/mark-availability-with-overlap/plan.md`

## What & Why

Implements PRD FR-005/006/007/008 and the "Given" clause of US-01: group members tap day+hour cells on a shared calendar to mark/unmark availability, and the calendar highlights slots where ≥ `⌈group_size × 2/3⌉` members are available. This is the wedge — the only FR doing real domain work, per the PRD itself ("if it's wrong the rest is dressing"). S-03 (confirm + push) is built on this slice's overlap surface.

## Starting Point

S-01 (`create-group-and-invite`) is archived: `/groups`, `/groups/[id]`, and invite flow are live on production. `groups` + `group_members` tables exist with an `is_group_member()` SECURITY DEFINER helper. The S-01 plan empirically demonstrated that PostgREST `auth.uid()` is broken on this Supabase project (`lessons.md` #2), so all mutations go through `createAdminClient()` with the app trusting `Astro.locals.user` as the auth gate. The `/groups/[id]` detail page currently shows just Members + Invite — there's no calendar surface yet. No date library, no test runner, no type generation; Tailwind 4 + shadcn (`button`, `card`, `input`, `label` installed).

## Desired End State

A signed-in member opens `/groups/<id>` and sees a 4-week calendar grid below the existing Members + Invite sections. Tapping any future (day, hour) cell toggles their own availability with optimistic UI. Each marked cell shows "N/M"; cells where N hits the `⌈M × 2/3⌉` threshold get a colored background + ring. Prev/Next/Today buttons slide the window; past weeks render read-only at half opacity. A second member on another browser sees the first member's marks after a page reload or window nav.

## Key Decisions Made

| Decision                          | Choice                                                                                                                | Why (1 sentence)                                                                                                                                                          | Source |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Scope boundary                    | Wedge core (FR-005/006/007/008) **plus** forward/backward week navigation                                             | Bounded enough to ship against `time` blocker; nav makes the 4-week window feel like a real calendar rather than a fixed-window snapshot.                                | Plan   |
| Data model                        | One row per `(group_id, user_id, slot_date, slot_hour)` with composite PK + FK to `group_members(group_id, user_id)`  | Simplest mental model; mirrors `group_members` shape; FR-007 unmark is one DELETE; auto-cleanup via FK CASCADE when member leaves.                                       | Plan   |
| Slot storage                      | Two columns: `slot_date date` + `slot_hour smallint (0..23)`                                                          | PRD §Access Control says "slots are stored and displayed as day + local hour" — single TZ per group makes UTC math noise. Matches PRD literally.                          | Plan   |
| Calendar window                   | Fixed 4-week window, navigable forward/back by week                                                                   | Bounded query (~7k rows worst case); enough horizon for a friend group; no pagination state to persist.                                                                  | Plan   |
| Overlap computation               | Aggregate on read: `SELECT slot_date, slot_hour, COUNT(*) GROUP BY` per window load                                   | Zero cache invalidation; trivially correct; cheap with `(group_id, slot_date)` index at friend-group scale.                                                              | Plan   |
| Threshold (visual emphasis)       | `⌈group_size × 2/3⌉` — dynamic to group size                                                                          | PRD says "most of the group is available here"; scales naturally; single formula.                                                                                        | Plan   |
| Visual emphasis treatment         | Single highlight (colored bg + ring) on above-threshold cells; count badge "N/M" on every marked cell                  | Scan-friendly; respects FR-008 "visually emphasized"; minimal CSS branching.                                                                                             | Plan   |
| Mark/unmark interaction           | Single tap toggles; optimistic UI; revert on non-2xx                                                                  | Matches PRD ("mark / unmark") literally; finger-friendly on mobile; trivial handler.                                                                                     | Plan   |
| Past slots                        | Disabled (50% opacity, non-interactive) AND backward nav allowed for read-only review                                  | Lets a host review historical overlap (forming intuition); prevents weird past-availability writes; server-side defense too.                                              | Plan   |
| S-03 forward-compat               | Punt — no `confirmed_session_id` column, no sessions table reservation                                                | YAGNI; S-03 can ALTER if it needs to; pre-shaping bakes in unvalidated 1:1 slot↔session assumption.                                                                       | Plan   |
| RLS posture                       | Inherit S-01 pattern: service-role admin client + `locals.user` gate + **explicit JS-level membership query** on `group_members`; RLS as defense-in-depth only | Lessons.md #2 binds this project; `is_group_member()` SQL helper can't be used from admin paths (service-role JWT → `auth.uid()`=NULL → helper returns false unconditionally); JS-level check is what S-01 actually uses.                                          | Lessons + Review |
| PostgREST `auth.uid()` re-verify  | **Skip** — trust the freshly-written lessons.md #2 (dated 2026-06-04)                                                  | User override of the lesson's default ritual; logged as accepted risk below; lesson is recent enough that nothing should have changed Supabase-side overnight.            | User   |
| Cross-member visibility           | Page-load / nav refresh only; no Supabase Realtime                                                                    | Friend-group scheduling cadence is daily, not seconds; no Realtime infra wired yet; subscription auth would face the same broken-JWT issue.                              | Plan   |
| Test runner                       | None added                                                                                                            | Consistent with S-01; manual smoke (curl + two-browser session) is the verification layer; tests are introduced in 10xDevs Module 3.                                     | Plan   |
| Endpoint shape                    | JSON-in / JSON-out (first JSON endpoints in repo); no form-encoded redirect like S-01                                  | Tap-to-toggle + week nav need interactive responses; native form POST + 302 would lose optimistic-UI continuity.                                                          | Plan   |
| Visible hour range (mobile UX)    | Decided at implementation time on a real phone; data model allows 0–23                                                | Mobile-first NFR; right answer is one screenshot away on a phone — not worth pre-deciding in the plan.                                                                   | Plan   |

## Scope

**In scope:**
- DB: 1 new migration with `availability` table (composite PK + composite FK to `group_members`), 1 supporting index, 3 RLS policies, no triggers.
- Backend: 1 shared helper (`src/lib/availability.ts`), 1 calendar-math helper (`src/lib/calendar.ts`), 3 new endpoints (GET `availability` for window, POST `mark`, POST `unmark`).
- UI: 1 new React island `<GroupCalendar client:load />`, mounted inside the existing `groups/[id].astro`. Past-cell disable, week nav, threshold highlight, count badges, optimistic toggle.

**Out of scope:**
- Sessions, push notifications (S-03 / F-02 territory).
- Real-time updates / Supabase Realtime subscription.
- Drag-to-select / bulk mark UI.
- Date libraries (date-fns, dayjs, luxon) — native `Date` + tiny helper module.
- Test runner / tests.
- Type generation (`supabase gen types`).
- Per-group time zone storage (PRD §Non-Goals).
- PostgREST `auth.uid()` re-verification at Phase 1 (user override of lessons.md #2 default).
- Leave-group / delete-group UI.

## Architecture / Approach

```
       Browser (GroupCalendar.tsx, client:load)
          │ ▲
          │ │ (initial render: props from server)
          │ │
  /groups/<id>.astro  ────► getAvailabilityWindow(admin, gid, uid, start, end)
   server-side script         │
                              ▼
                           Supabase admin client ──► availability + group_members
                              │
          ◀───── { slots, myMarks, groupSize, threshold } ──── ┘

  Tap cell → optimistic state flip → POST /api/groups/<id>/availability/mark
                                       │ (or .../unmark)
                                       ▼ admin client + locals.user check
                                       INSERT…ON CONFLICT DO NOTHING (or DELETE)
                                       ◀── 200 {ok:true}  (revert on 4xx)

  Prev / Next / Today → GET /api/groups/<id>/availability?start&end
                                       ▼ same helper
                                       ◀── new window payload, swap state
```

Membership is checked at the **JS level** in every endpoint and the server-render path: `await admin.from("group_members").select("user_id").eq("group_id", id).eq("user_id", user.id).maybeSingle()` → 403 if absent. The SQL helper `is_group_member()` is NOT used from admin paths (service-role JWT → `auth.uid()` is NULL → helper always returns false). RLS policies on `availability` still reference the helper for defense-in-depth against direct PostgREST anonymous traffic.

## Phases at a Glance

| Phase                                | What it delivers                                                                                              | Key risk                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Schema + RLS migration            | `availability` table + index + 3 RLS policies, applied to `dchurjcpgzuoyunjsokl`                              | Composite FK to `group_members(group_id, user_id)` requires that table's PK ordering matches — verified in S-01's migration; copy carefully.       |
| 2. Endpoints + read helper           | `src/lib/availability.ts`, `src/lib/calendar.ts`, GET availability, POST mark, POST unmark                    | First JSON endpoints in the repo — error-shape pattern (`{error: string}` + 4xx) needs to be set deliberately so S-03 can copy it.                 |
| 3. Calendar React island             | `<GroupCalendar />` mounted on `/groups/[id]`, tap-to-toggle, week nav, threshold highlight, mobile usable    | The visible-hour-range choice is the only real UX risk — easy to get wrong on a phone; plan defers to a real-phone test at build time.            |

**Prerequisites:**
- S-01 archived and live on production (✓ done 2026-06-02).
- Supabase project `dchurjcpgzuoyunjsokl` accessible via Vercel → Storage → "Open in Supabase".
- Local `.env` already repointed at the consolidated project (✓ done in S-01's Prerequisites).
- `npm run dev` working locally.

**Estimated effort:** ~3 focused sessions across 3 phases.
- Phase 1 ~30 min (migration write + Studio apply + FK smoke).
- Phase 2 ~2 hr (5 new files, JSON pattern, curl smoke for all branches).
- Phase 3 ~2–3 hr (calendar grid, optimistic toggle, week nav, threshold logic, real-phone iteration, two-account prod smoke).

## Open Risks & Assumptions

- **Accepted risk:** Phase 1 skips the lessons.md #2 PostgREST re-verification ritual (user override). The lesson was written 2026-06-04 from S-01's S-01 incident, so the platform state is recent. If a future change touches RLS-gated paths, that change should run the verification itself.
- **Assumption:** group sizes stay small (≤10 members) per PRD `target_scale.users: small`. The aggregate-on-read query is comfortable in that range; would need a maintained counter or covering index if scaled to 50+.
- **Assumption:** the mobile-first visible-hour range can be locked at implementation time on a real phone without a follow-up plan. If the right window turns out to be controversial (e.g., night owls want past-midnight), it becomes a v2 decision.
- **Risk:** the JSON endpoint shape (`{ok:true}` / `{error:string}`) becomes a project convention by being the first one — worth establishing it deliberately because S-03 will copy it. The pattern is intentionally minimal; expand only when needed.
- **Risk:** optimistic UI revert-on-error needs the error indicator to be visible without being noisy. Pinned in the plan as red-ring-2s + `console.warn` (matches S-01's inline error treatment).
- **Accepted v1 risk:** rapid tap-mark-then-tap-unmark on the same cell can yield brief UI↔DB divergence under unreliable network (two POSTs resolving out of order). Resolved by next nav/reload (eventual consistency). Friend-group scale + idempotent mark/unmark make this benign in practice.

## Success Criteria (Summary)

- A group member taps a future cell on `/groups/<id>` on production → cell shows "1/M" within ~16ms, persists across reload, visible to other members on their next nav/reload.
- For a 3+ member group, when ≥ `⌈M × 2/3⌉` members mark the same cell, the cell is visually emphasized (colored background + ring) on every member's view.
- Past cells render but cannot be toggled; backward week nav reveals historical overlap read-only.
- The next change (`/10x-new confirm-session-with-push-notification`) starts from an `availability` table whose `(group_id, slot_date, slot_hour, count)` shape has been exercised in production with two real Google accounts.
