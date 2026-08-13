# Multiple Sessions per Group + Cancellation — Plan Brief

> Full plan: `context/changes/multi-sessions-and-cancel/plan.md`

## What & Why

Loosen S-03's single-session UI guard so multiple confirmed sessions can coexist in one group (any member proposes, not just the current host), and add a host-only cancellation flow with a proper "Session cancelled" push. Reflects real friend-group behavior: sessions get planned, sessions get moved, sessions get cancelled — and everyone should know when the third happens.

## Starting Point

S-03 (`confirm-session-with-push-notification`, archived 2026-07-22) shipped one-session-per-group semantics in the UI: `getNextUpcomingSession` returns the earliest future session; `showConfirmColumn` hides the entire ✓ column from non-hosts once any session exists; `sessions` table has no UPDATE/DELETE RLS policies. The DB itself already supports multi-session per group (UNIQUE is per-slot, not per-group) — the constraint is client-side only.

## Desired End State

Every future confirmed session in the visible calendar window renders a ★ badge on its cell. Any member with a marked availability + no conflicting session at that hour sees a ✓ button in the right column and can propose a new session. Session hosts see a ✗ button on their session's day-row that opens a `CancelSessionDialog` ("Cancel session at Sat 3pm? Everyone will get a notification"). Confirming the cancel fires a push notification to every group member (same `session-<id>` tag so it replaces any still-visible "confirmed" push) and reloads the page. Banner still shows the single next-upcoming session and auto-promotes after a cancel.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Session multiplicity | No per-day cap; only DB UNIQUE per slot | Matches what the DB already enforces; friend-group scale doesn't need extra ceiling. |
| Non-host column visibility | Drop `showConfirmColumn` gate entirely | User's explicit ask; DB never enforced host-only semantics anyway. |
| Cancel button placement | ✗ replaces ✓ on rows where a session lives AND viewer is that session's host | One button per row keeps the UI compact; the intent (confirm vs cancel) follows the session state. |
| DELETE endpoint shape | `DELETE /api/groups/[id]/sessions/[session_id]` | REST-standard, matches HTTP semantics; Astro dynamic segments support this. |
| Cancel auth | `locals.user` + admin + JS-level `user.id === session.host_user_id` | Matches lessons.md §2 (PostgREST auth.uid() broken here); operative gate at the app layer. |
| DB RLS defense | Add `sessions: host delete` policy | Defense-in-depth per S-03 convention; not the operative gate but blocks stolen-key direct traffic. |
| Cancel confirmation UI | shadcn Dialog "Cancel session at <slot>? Everyone will get a notification" + Cancel/Confirm Cancel | Cancels fire a group-wide push; worth one click to prevent accidental firing. |
| Cancel push payload | title=`Session cancelled`, body=`<slot> · <location>`, url=`/groups/<id>`, tag=`session-<id>` | Same tag as confirm on purpose — Web Push spec collapses/replaces still-visible confirmed push in-place. |
| Fan-out scope | Every group member including cancelling host | Symmetric with confirm; proves pipeline on initiator's own device (best iOS signal). |
| Banner post-cancel | Auto-promote from `getUpcomingSessions()[0]` | Same helper drives banner + calendar badges; single source of truth; empty array → no banner. |
| Post-cancel calendar state | `window.location.reload()` after DELETE | Matches S-03 confirm flow; SSR re-renders the full new truth. |

## Scope

**In scope:**
- 1 new migration: `sessions: host delete` RLS policy
- 1 new helper: `getUpcomingSessions(admin, groupId)` returning `SessionWithHost[]`; retire `getNextUpcomingSession`
- 1 new endpoint: `DELETE /api/groups/[id]/sessions/[session_id]`
- 1 new component: `CancelSessionDialog.tsx`
- `GroupCalendar.tsx` prop shape change: `confirmedSession` (singular) → `confirmedSessions[]`; remove `showConfirmColumn`; per-row logic to switch ✓ / ✗ / empty
- `groups/[id].astro` SSR-side switch to array; compute `iAmHost` per session; pass array; banner still uses `[0]`

**Out of scope:**
- Session editing (change slot, change location) — cancel + confirm again is the workflow
- Cancel reason / note field
- Excluding host from cancel fan-out
- Session history / past-sessions list
- New push payload types (reuses F-02's `PushPayload`)
- Per-day session cap or UI ceiling on session count
- Automated tests
- New push tag scheme

## Architecture / Approach

```
                                Browser (GroupCalendar.tsx)
                                  │
                                  │  Click ✗ on host's session day-row
                                  ▼
                     <CancelSessionDialog>  ──► DELETE /api/groups/<id>/sessions/<sid>
                                                       │
        (on 200) window.location.reload()              ▼
                    ▲                            admin + locals.user + membership + session-lookup + host check
                    │                                  │
                    └──── banner + ★ badges + column   ▼
                          re-render from SSR truth    DELETE session row
                          (getUpcomingSessions[])      │
                                                       ▼
                                                  SELECT group_members
                                                       │
                                                       ▼  (sequential loop)
                                                  sendPushToUser(admin, memberId, cancelPayload)
                                                       │
                                                       ▼
                                                  console.log("session <id> → cancel fanout: …")
```

Same shape as S-03's confirm path — different verb (DELETE), different payload title, same tag so notifications collapse cleanly. All auth at the JS layer; RLS as defense-in-depth. Fan-out failures never fail the request (row is already gone).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. `sessions: host delete` migration | New RLS policy applied to `dchurjcpgzuoyunjsokl` | None material — defense-in-depth policy; the operative gate is JS-layer anyway. |
| 2. `getUpcomingSessions` + DELETE endpoint | Server can cancel + fan out; helper returns array | Endpoint file is nested (`[id]/sessions/[session_id].ts`); getting the Astro dynamic-route filename shape right matters. |
| 3. UI — multi-badge + cancel dialog + column ungate | Every future ★ visible; hosts see ✗ + dialog; non-hosts can propose sessions on unused days | Prop shape change (singular → array) has one caller (`groups/[id].astro`) — easy to miss during refactor if not done in same commit. |

**Prerequisites:**
- S-03 archived and in production (✓ done 2026-07-22)
- Two Google accounts with PWA push subscriptions on iOS + Android for two-account manual smoke

**Estimated effort:** ~3 focused sessions.
- Phase 1: ~15 min (one CLI migration + Studio smoke)
- Phase 2: ~1 hr (helper + endpoint + `curl` smoke all branches)
- Phase 3: ~2 hr (dialog + prop refactor + two-account real-device smoke)

## Open Risks & Assumptions

- **Assumption: F-02 `sendPushToUser` behavior is unchanged.** No F-02 modifications; the cancel path is a second caller with a different payload. If F-02 changes helper contract mid-flight, revisit.
- **Assumption: `tag: "session-<id>"` collapsing works on iOS PWA.** Web Push spec says the OS should replace a still-visible notification with the same tag. Verified empirically only on Android in past work; iOS behavior confirmed as "replace" in the standard but could vary by iOS version.
- **Race condition: two devices as the same host cancel the same session simultaneously.** DB DELETE is idempotent (second DELETE affects 0 rows); the endpoint's session fetch happens BEFORE the DELETE, so second caller may still pass the host check then find 0 rows deleted — treat as success (row is gone). No user-visible bug.
- **Race: host confirms a session then cancels immediately, before push arrives.** Two pushes with the same tag arrive in order. OS collapses them. If they arrive out of order (rare), the earlier push takes precedence visually. Acceptable at friend-group scale.
- **Accepted v1 risk: cancel fan-out failures never fail the DELETE.** The session is gone from the DB regardless. If a push fails to reach some member, they won't know the session was cancelled until they open the app.
- **Multi-session banner UX:** the banner shows only the earliest future session. If a group has three future sessions and the earliest gets cancelled, the banner shifts to what was previously S2. If there's a phone push "Session cancelled" landing near-simultaneously with a page opening showing the S2 banner, the user might see a "cancelled" push referring to S1 while the app now emphasizes S2. Acceptable — the notification body carries the specific slot/location.

## Success Criteria (Summary)

- Two accounts (A + B) in the same group can each confirm their own session; both members see both ★ badges; each host sees ✗ only on their own session's day; banner shows earlier of the two.
- Host A clicks ✗ → CancelSessionDialog → Confirm → both A and B receive a push titled "Session cancelled" with the correct slot + location; page reloads; banner promotes to B's session; ★ removed from A's cell.
- Non-host of session S1 has no ✗ affordance on S1's day but can still confirm their own sessions on other days.
- Every access-control probe (403 for non-host cancel, 404 for wrong session_id or already-cancelled, 401 for anon) matches the plan.
