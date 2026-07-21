<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Mark Availability with Overlap Surfacing

- **Plan**: `context/changes/mark-availability-with-overlap/plan.md`
- **Scope**: Full plan (3 phases, 4 commits: a3a1a64 / 3a5f7d6 / c14d927 / d3ecdb6)
- **Date**: 2026-06-04
- **Verdict**: APPROVED (1 warning + 3 observations, all triaged)
- **Findings**: 0 critical · 1 warning · 3 observations

## Verdicts

| Dimension           | Verdict (initial) | After triage |
| ------------------- | ----------------- | ------------ |
| Plan Adherence      | PASS              | PASS         |
| Scope Discipline    | PASS              | PASS         |
| Safety & Quality    | WARNING           | PASS         |
| Architecture        | PASS              | PASS         |
| Pattern Consistency | PASS              | PASS         |
| Success Criteria    | PASS              | PASS         |

Automated checks at review time: `npm run typecheck` 0 errors / 0 warnings / 7 pre-existing hints; `npm run lint` 0 errors (2 prescribed `console.warn` warnings per plan-review F3); `npm run build` clean. Plan-review fixes F1–F4 all verified in code. Lessons.md priors (#1 PostgREST auth.uid broken → app-layer JS membership; #2 CLI not Studio for migrations) honored.

## Findings

### F1 — Stale-revert race when rapid taps span different cells

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: `src/components/GroupCalendar.tsx:96, 120` (pre-fix)
- **Detail**: `beforeMarks = data.marks` snapshot captured BEFORE the optimistic update. If user taps cell A (POST mark A starts), then quickly taps cell B (POST mark B starts), and A fails, the revert restored the pre-A snapshot — silently discarding B's successful UI mutation. UI desync until next nav/reload. Different from the F4-from-plan-review same-cell race; this is across-cell snapshot pollution.
- **Fix A ⭐ Recommended**: Inverse revert against current state (no snapshot)
  - Strength: Removes the stale-snapshot class entirely; preserves optimistic-UI feel.
  - Tradeoff: ~10 LOC; move-start path needs prior hour captured at toggle time (already in `currentStart` scope).
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Fix B**: Disable cells while their request is in flight
  - Strength: Simplest correctness.
  - Tradeoff: Latency feel on slow connections.
  - Confidence: HIGH.
- **Decision**: FIXED via Fix A — applied 2026-06-04. `toggle` now reverts by applying the inverse op against `prev.myMarks` (post-F3 shape) without capturing a full-state snapshot.

### F2 — Redundant `group_members` count query

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: `src/lib/availability.ts:38-42` (called by GET endpoint + Astro page)
- **Detail**: Each call site does a membership check (1st query), then `getAvailabilityWindow` runs its own `count: exact` (2nd query for the same group). Astro page additionally pulls members for the Members list. Performance trivial at v1 scale, but N+1-adjacent.
- **Fix**: Optional `groupSize?: number` param on `getAvailabilityWindow`; caller passes when known.
- **Decision**: FIXED — applied 2026-06-04. Helper accepts optional `groupSize`; Astro page passes `memberIds.length` to skip the redundant COUNT. GET endpoint continues to fall back to internal count (acceptable — endpoint membership check is single-row maybeSingle, doesn't yield a count).

### F3 — `marks` payload exposes other members' user_ids

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Privacy)
- **Location**: `src/lib/availability.ts:26` (`AvailabilityWindow` shape, pre-fix)
- **Detail**: Helper returned raw rows including every member's `user_id`. PRD privacy NFR satisfied (recipients are authorized members), but the rendering contract only needed (a) own start per date and (b) cumulative count — not other identities.
- **Fix**: Split the wire shape into `myMarks` and `othersMarks` (both `{slot_date, slot_hour}[]` with NO `user_id`). Helper takes `userId` and partitions server-side; client renders the same UI without knowing other members' identities.
- **Decision**: FIXED — applied 2026-06-04. New `AvailabilityWindow = { myMarks, othersMarks, groupSize, threshold }`. `GroupCalendar` no longer needs a `userId` prop (helper does the split). Optimistic updates now mutate only `myMarks`. user_ids are kept server-side.

### F4 — Plan's Phase 3 Props block doesn't mention `userId`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (minor)
- **Location**: plan.md → Phase 3 → Changes Required → GroupCalendar island Props
- **Detail**: The mid-Phase-3 rework added a `userId` prop. The Critical Implementation Details addendum documented the rework but didn't enumerate the prop delta.
- **Decision**: DISMISSED — F3's reshape removed the `userId` prop again (helper splits server-side now), so the final Props match the original Phase 3 contract. Finding became stale during triage.
