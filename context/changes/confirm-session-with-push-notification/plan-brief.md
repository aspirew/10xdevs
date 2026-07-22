# Confirm Session with Push Notification — Plan Brief

> Full plan: `context/changes/confirm-session-with-push-notification/plan.md`

## What & Why

Ship the north star: a group member picks a future slot on the shared calendar, sets a free-text location in a dialog, confirms → new row in `sessions`, server fans out a Web Push to every group member via F-02's `sendPushToUser`. Closes US-01 end-to-end and validates the GameSlot wedge with one real friend group. Implements PRD FR-009/010/011/012 and resolves PRD Open Question #2 (unmark-after-confirm semantics).

## Starting Point

`/groups/[id]` renders a 4-week availability calendar with tap-to-toggle marking and threshold-based visual emphasis (S-02, archived). PWA is installable on iOS + Android and F-02's `sendPushToUser(admin, userId, payload)` helper is exported, tested, and one call away (F-02, archived). Auth pattern is locked: every mutation uses `locals.user` + `createAdminClient()` + JS-level `group_members` check + RLS as defense-in-depth (lessons.md §2 — PostgREST `auth.uid()` is broken on this project). shadcn is configured (`button`, `card`, `input`, `label` installed; `dialog` is not). No `sessions` table, no confirm surface, no fan-out call site.

## Desired End State

A member long-presses a future slot with ≥1 available member → shadcn Dialog opens with slot summary + Input for location → Confirm POSTs to `/api/groups/[id]/sessions` → session row lands (UNIQUE per group+slot) → server fans out one push per group member (including host) → `/groups/[id]` reloads and shows a banner ("Next session: Sat, Oct 3 · 7pm · Anna's place · Hosted by <email>") plus a subtle badge on the confirmed cell. Two Google accounts on iOS + Android PWA both receive the push with tab closed.

## Key Decisions Made

| Decision                                    | Choice                                                                                                          | Why (1 sentence)                                                                                                                              | Source |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Concurrency on same-slot double confirm      | UNIQUE `(group_id, slot_date, slot_hour)` at DB layer; endpoint catches PG code `23505` → 409                    | Free at friend-group scale; DB serializes; JS pre-check would be TOCTOU-vulnerable.                                                          | Plan |
| Post-confirm unmark semantics (PRD Open Q #2)| Allow unmark; session row untouched                                                                              | Sessions decouple from availability once confirmed; no cross-table trigger; matches how a real group works ("someone can't make it now").    | Plan |
| Confirm affordance                          | Long-press (500ms pointerdown) on future cells with ≥1 marker; tap keeps S-02 toggle semantic                    | Preserves S-02 muscle memory; no accidental confirms; below-grid hint line explains both gestures.                                            | Plan |
| Location input UX                           | shadcn `Dialog` with read-only slot summary + `Input` + Confirm/Cancel                                           | Modal owns the flow; requires one new shadcn primitive; sets the dialog pattern for v1.                                                       | Plan |
| Post-confirm calendar surface               | Persistent SSR banner above the calendar (next upcoming session only) + subtle cell badge on the confirmed slot   | Banner is the wedge outcome ("the group is coordinated"); badge preserves the calendar-as-truth link; server truth means no client reconcile. | Plan |
| Push fan-out scope                          | Loop all `group_members`, including the host                                                                    | Proves the pipeline on the initiator's own device (iOS validation); symmetric semantics; host's other devices get notified.                    | Plan |
| Delivery instrumentation                    | Server console log per confirm: `session <id> → fanout: sent=X failed=Y deleted=Z`                               | Roadmap S-03 flagged "instrument delivery is the cheapest hedge"; log leverages F-02's existing per-endpoint tracking; no new schema.          | Plan |
| Banner scope                                | Show only the next upcoming session (`WHERE slot_date >= today ORDER BY … LIMIT 1`)                              | Friend-group cadence rarely produces multiple future sessions; simplest query; matches `top_blocker = time`.                                   | Plan |
| Post-confirm client update                  | `window.location.reload()` after successful POST — banner + cell badge re-render from SSR                        | Matches S-02's "page-load / nav refresh" convention; zero client-state reconciliation.                                                        | Plan |
| Session cancellation / editing              | Explicitly out of scope for v1                                                                                  | Adds a second push type + UI; not in PRD; `top_blocker = time` rules it out for the north star.                                                | Plan |
| Session history view                        | Not built                                                                                                       | PRD Non-Goals + `main_goal = market-feedback`; past sessions persist in DB with no UI surface until real demand.                              | Plan |
| Test runner                                 | None added                                                                                                      | Consistent with S-01/S-02/F-02; manual smoke + two-device production test is the verification layer.                                          | Plan |
| Migration application                       | `npx supabase db push --linked` only — never Studio SQL editor                                                    | Lessons.md §5 — Studio paste breaks CLI reconciliation and the migration audit trail.                                                          | Lesson |
| Auth gate on `POST /sessions`               | Reuse S-02 pattern: `locals.user` + admin + JS-level membership; RLS as defense-only                             | Lessons.md §2 — PostgREST `auth.uid()` is broken; RLS cannot be trusted as the operative gate.                                                 | Lesson |
| Slot spec check                             | Server queries `availability` for `slot_hour <= body.slot_hour` at `slot_date`; requires ≥1; else 400            | UI hints guide but a hand-rolled `curl` must be rejected; matches FR-009 ("an availability slot").                                             | Plan |

## Scope

**In scope:**
- 1 new migration: `sessions` table (columns + UNIQUE + composite FK + index + 2 RLS policies)
- 1 new helper module (`src/lib/sessions.ts` with `getNextUpcomingSession` + `Session` / `SessionWithHost` types)
- 1 new endpoint (`POST /api/groups/[id]/sessions`) with fan-out to `sendPushToUser`
- 1 new helper in `src/lib/calendar.ts`: `formatSlotLabel(date, hour)` (shared server + client)
- 1 shadcn `dialog` primitive install
- 1 new React component (`ConfirmSessionDialog.tsx`)
- Extend `GroupCalendar.tsx` with `confirmedSession` prop + cell badge + long-press handler
- Extend `groups/[id].astro` with SSR banner block + `sessionInitial` propagation
- Server console log on every confirm for delivery instrumentation

**Out of scope:**
- Session editing / cancellation / delete UI or endpoint
- Session history view (past sessions have no UI surface)
- Multi-future-session banner list
- Cross-table availability-unmark trigger
- Push denial fallback (PRD Open Q #3 — accepted risk)
- New push payload types (reuses F-02's `PushPayload`)
- Delivery-audit table
- Automated tests
- Email / SMS fallback
- Custom install prompt in the confirm dialog (F-02's `/install` owns onboarding)

## Architecture / Approach

```
              Browser (GroupCalendar.tsx, client:load)
                │
                │  Long-press on future cell w/ ≥1 marker
                ▼
     <ConfirmSessionDialog>  ── slot summary + <Input> + Confirm ─►  POST /api/groups/<id>/sessions
                                                                          │
       (on 200) window.location.reload()                                   ▼
                ▲                                                       admin.locals.user + membership + spec check
                │                                                          │
                └──────  banner + cell badge re-render from SSR            ▼
                         (getNextUpcomingSession)                     INSERT sessions
                                                                          │  (UNIQUE catches double-confirm → 409)
                                                                          ▼
                                                                     SELECT group_members
                                                                          │
                                                                          ▼  (sequential loop)
                                                                     sendPushToUser(admin, member, payload)
                                                                          │
                                                                          ▼
                                                                     console.log("session <id> → fanout: …")
```

Membership is enforced at the JS layer in the endpoint (same S-02 pattern). RLS on `sessions` exists for defense-in-depth against direct PostgREST traffic — never as the operative gate. Fan-out is sequential (small groups; a hung `web-push` call on one dead endpoint shouldn't reorder others). Fan-out failures never fail the request; the session is already committed by then.

## Phases at a Glance

| Phase                                | What it delivers                                                                                | Key risk                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `sessions` schema + RLS migration | `sessions` table with UNIQUE, composite FK, defense-in-depth policies applied to `dchurjcpgzuoyunjsokl` | Composite FK ordering must match `group_members(group_id, user_id)` PK; RLS policy pattern must copy `availability` exactly.                  |
| 2. Endpoint + fan-out + helper       | `POST /api/groups/[id]/sessions`, `getNextUpcomingSession`, one push per member, log line, 409 on conflict | The `23505` catch is easy to miss (Postgres error surfaces as a supabase-js error object, not a raw code) — verify empirically before Phase 3. |
| 3. UI — banner + dialog + cell badge  | Long-press affordance, shadcn dialog install, SSR banner, cell badge, `window.location.reload()` handoff | Long-press vs tap discrimination on iOS Safari can conflict with the SW / gesture cancellation — verify on a real phone before merging.       |

**Prerequisites:**
- S-02 archived and in production (✓ done 2026-07-21).
- F-02 archived and in production (✓ done 2026-07-22).
- Vercel + Supabase project `dchurjcpgzuoyunjsokl` linked (✓).
- Two Google accounts, one iOS phone (PWA installed), one Android phone (PWA installed), both push-subscribed via F-02's `/install` flow.

**Estimated effort:** ~3 focused sessions.
- Phase 1 ~30 min (one migration; copy `availability` pattern; CLI apply; Studio smoke).
- Phase 2 ~2 hr (helper + endpoint + fan-out + `curl` smoke for all branches).
- Phase 3 ~2–3 hr (shadcn install, dialog component, long-press handler, cell badge, real-phone iteration, two-account two-device production smoke).

## Open Risks & Assumptions

- **Assumption: F-02's `sendPushToUser` and subscription table are already exercised end-to-end in production.** Verified before this slice started (F-02 impl-review APPROVED, prod tag `prod-2026-07-21-f02`). If a bug in F-02 surfaces during S-03's fan-out, it belongs in a new F-02 patch change, not in S-03.
- **Assumption: iOS Safari fires `pointerdown` / `pointerup` reliably inside the calendar grid.** If it doesn't (some iOS versions have known event-model quirks), the long-press handler needs a `touchstart` / `touchend` fallback — hedged in the plan by testing on real device before merge.
- **Risk: long-press-vs-tap discrimination collides with iOS default behaviors** (context menu on hold, text selection). Mitigation: `-webkit-touch-callout: none` + `user-select: none` on cell CSS; `preventDefault()` on `pointerup` after the timer fires. Verify on iOS Safari.
- **Risk: `web-push` fan-out latency on N members.** Sequential loop over ≤10 members should complete well under the 300s function timeout, but a hung endpoint (rare, RFC 8291 has no explicit timeout) could stall the response. F-02's `sendPushToUser` doesn't currently impose a per-call timeout — if this bites, add `AbortSignal.timeout(5000)` in a follow-up. Not blocking for v1.
- **Accepted v1 risk: no fallback if all pushes fail.** Confirmer sees the banner (browser knows it succeeded); other members don't learn about the session until they open the app. Push denial is PRD Open Q #3 — deferred.
- **Accepted v1 risk: banner shows only one future session.** Multi-session groups (rare in a friend group) will see the earlier one; the later one only surfaces after the earlier date passes. Acceptable for v1.
- **Assumption: `formatSlotLabel` produces identical output on server (push body) and client (banner + dialog).** Pure function, no locale/tz variation intended; still worth a sanity check when landing Phase 2.

## Success Criteria (Summary)

- Two real Google accounts on two devices (one iOS PWA, one Android PWA) confirm a session in a shared group and both receive a push notification titled "Session confirmed" with correct slot + location, tab closed.
- Repeated confirm at an already-confirmed slot returns 409; unmark of availability at a confirmed slot succeeds silently; banner reflects the earliest future session only.
- Server logs show one `session <id> → fanout: sent=<n> failed=<n> deleted=<n>` line per confirm.
- After this slice ships, US-01 runs end-to-end for one real friend group and the wedge is validated.
