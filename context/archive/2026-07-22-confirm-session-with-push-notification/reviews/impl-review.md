<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Confirm Session with Push Notification

- **Plan**: `context/changes/confirm-session-with-push-notification/plan.md`
- **Scope**: Full plan (Phases 1–3)
- **Date**: 2026-07-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — inserted row not null-narrowed before use

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/groups/[id]/sessions.ts:96`
- **Detail**: `const session: Session = inserted;` after `.select().single()` treats `inserted` as non-null when `insertErr` is null. Supabase's `.single()` typings permit `data === null` in odd cases (e.g., a policy that lets INSERT through but blocks the returning SELECT). Not exploitable on this admin-client path since RLS is defense-in-depth only, but the implicit cast quietly hides the null case from the type system.
- **Fix**: Add a defensive null guard before use: `if (!inserted) return json(500, { error: "Insert returned no row" });` then `const session: Session = inserted;`.
- **Decision**: FIXED

### F2 — Fan-out throws under-count in aggregate log

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/groups/[id]/sessions.ts:118-121`
- **Detail**: On `sendPushToUser` throw (VAPID misconfig / DB read error / etc.), the catch does `total.failed += 1`. In reality that member may have had N push_subscriptions, all effectively unreachable. Currently the helper only throws before iterating (so 1 is always technically true), but a future refactor of `sendPushToUser` to throw mid-loop would silently under-report failures.
- **Fix**: Either (a) document the invariant with a code comment where the `+=1` lives, or (b) look up the caller's subscription count for accurate counting. Given F-02 owns the helper contract and this log is a rough operational signal, (a) is enough.
- **Decision**: FIXED (via option (a) — invariant comment)

### F3 — Banner "today" cutoff uses server-local TZ

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/sessions.ts:36`
- **Detail**: `getNextUpcomingSession` uses `formatDate(new Date())` for the `slot_date >= today` filter. On Vercel the function process runs in UTC; between the group's local midnight and UTC midnight a session that already occurred locally may still surface as "next upcoming." Matches the app-wide single-TZ / no-UTC-conversion convention established by `src/lib/calendar.ts` and covered by PRD §Non-Goals. Worth calling out because the banner is the newest place a user might notice this — but not a defect against the plan.
- **Fix**: No action. Reconfirm posture only if multi-TZ groups become a real feature request (PRD parks it).
- **Decision**: SKIPPED
