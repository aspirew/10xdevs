<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Mark Availability with Overlap Surfacing

- **Plan**: `context/changes/mark-availability-with-overlap/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-04
- **Verdict**: REVISE → SOUND (all findings triaged + applied)
- **Findings**: 2 critical, 1 warning, 1 observation

## Verdicts

| Dimension             | Verdict (initial) | After triage |
| --------------------- | ----------------- | ------------ |
| End-State Alignment   | PASS              | PASS         |
| Lean Execution        | PASS              | PASS         |
| Architectural Fitness | PASS              | PASS         |
| Blind Spots           | FAIL              | PASS         |
| Plan Completeness     | WARNING           | PASS         |

## Grounding

9/9 paths ✓, 4/4 symbols ✓ (`is_group_member`, `createAdminClient`, `Astro.locals.user`, `group_members` PK order matches FK), brief↔plan ✓, Progress↔Phase consistency ✓. `docs/reference/contract-surfaces.md` absent → skipped (opt-in convention).

## Findings

### F1 — Server-side past-slot validation is wrong by user-TZ offset

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details → "Past-slot boundary"; Phase 2 mark/unmark contracts
- **Detail**: Plan declared server-side past validation using `slot_hour < EXTRACT(HOUR FROM now())` and promised "defensive 400 on past-slot mutations." Supabase Postgres + Vercel functions default to UTC; users sit in Europe/Warsaw (UTC+2 summer). PRD locks "single TZ per group" but plan stored no group TZ. Result: server validation is wrong by the user's UTC offset; UI past-disable in browser-local Date is correct. The "defensive 400" claim was false on the actual infra.
- **Fix A ⭐ Recommended**: Drop server-side past validation; document UI-only enforcement.
  - Strength: matches v1 friend-group threat model; honest about layer; smallest scope; mirrors S-01's "RLS as defense-in-depth, app layer as gate" trade.
  - Tradeoff: weakens "defense in depth" framing; a future multi-TZ feature would need server TZ awareness anyway.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Fix B**: Add `time_zone text` column to groups + thread through helper + `Intl.DateTimeFormat` in endpoints.
  - Strength: server validation correct; forward-prepares for multi-TZ.
  - Tradeoff: +30 min scope; conflicts with PRD §Non-Goals "No multi-TZ support."
  - Confidence: MEDIUM.
  - Blind spot: TZ defaulting on group creation is its own micro-decision.
- **Decision**: FIXED via Fix A — applied 2026-06-04. Plan's Critical Implementation Details now reads "UI-only" with explicit acknowledgment of the layer split; mark/unmark contracts no longer claim past-slot rejection; manual verification + Progress items updated.

### F2 — `is_group_member()` won't work inside admin-client queries

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Implementation Approach §3; Phase 2 endpoint contracts; brief Architecture
- **Detail**: Plan stated membership is "baked into WHERE clauses" via `is_group_member(group_id)`. The helper internally calls `auth.uid()` (line 28 of S-01 migration). Service-role JWT → `auth.uid()` returns NULL → helper returns false → admin-client queries with `WHERE is_group_member(...)` always return empty. S-01's actual code never uses the helper from admin paths — `src/pages/groups/[id].astro:49` maps `memberUserIds` and tests `.includes(user.id)`; `src/pages/api/groups/[id]/regenerate-invite.ts:23-39` uses explicit `select+maybeSingle`. Plan implementer following the literal text would write zero-row queries.
- **Fix**: Rewrite Phase 2 + Implementation Approach + brief Architecture to spell out the JS-level membership check pattern (`admin.from("group_members").select("user_id").eq("group_id", id).eq("user_id", user.id).maybeSingle()` → 403). Keep RLS policies referencing `is_group_member()` (defense-in-depth on direct PostgREST traffic, where there's no user identity anyway).
- **Decision**: FIXED — applied 2026-06-04. Implementation Approach + GET endpoint contract + brief Architecture + brief Key Decisions row all updated; new bullet added to Critical Implementation Details ("Membership check shape (lessons.md #2 follow-on)").

### F3 — Optimistic-UI error indicator is vague

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Critical Implementation Details → "Optimistic UI revert"
- **Detail**: Plan said "non-blocking error indicator should appear" without specifying form (toast / cell tint / status bar). Implementer guess required.
- **Fix**: Pin as red-ring-2s + `console.warn(error.message)`. No new component install; mirrors inline error treatment at `groups/[id].astro:88-98`.
- **Decision**: FIXED — applied 2026-06-04. Critical Implementation Details bullet now specifies `ring-2 ring-red-500` via per-cell `failedAt` timestamp cleared after 2s + `console.warn`.

### F4 — Rapid tap mark+unmark race not acknowledged

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details → "Optimistic UI revert"
- **Detail**: Two rapid taps (mark, then unmark) on the same cell fire two POSTs optimistically. Under unreliable network the second can resolve before the first → DB ends inserted while UI shows deleted, until next nav/reload corrects.
- **Fix**: Add one bullet to plan-brief Open Risks acknowledging eventual consistency as the recovery mechanism.
- **Decision**: FIXED — applied 2026-06-04. New bullet under "Open Risks & Assumptions" labels it accepted v1 risk; brief rationale (idempotent mark/unmark + friend-group scale) noted.
