<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Compact Time-Slots Table

- **Plan**: `context/changes/compact-time-slots-table/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-11
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

5/5 paths ✓, 5/5 symbols ✓, brief↔plan ✓

## Findings

### F1 — Window-days duplicated across GroupCalendar.tsx and groups/[id].astro

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 changes 1 + 4
- **Detail**: Plan sets `WINDOW_DAYS = 7` inside GroupCalendar.tsx AND independently hardcodes `addDays(today, 6)` in groups/[id].astro. Same magic number expressed two different ways. The plan applies drift-prevention discipline within the calendar file (refactoring `±7` to `±WINDOW_DAYS`) but doesn't extend it across the file boundary.
- **Fix**: Extract WINDOW_DAYS to `src/lib/calendar.ts` as an exported const, then import from both GroupCalendar.tsx (replacing the local const) and groups/[id].astro (`addDays(today, WINDOW_DAYS - 1)`).
- **Decision**: FIXED (added Change 5 to Phase 1; adjusted Changes 1 & 4 to import; plan-brief Key Decisions + Scope + Architecture updated)

### F2 — Pre-existing marks outside 10..20 range: risk noted in brief but not plan.md

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: plan-brief.md "Open Risks & Assumptions" (missing from plan.md)
- **Detail**: A user who marked availability at hour 8, 9, or 21–23 still has that row in `availability`. Start-hour semantic means those marks still contribute to overlap counts at visible cells. But the UI has no cell to toggle those start-hours off. Plan-brief acknowledges this under Open Risks; plan.md has no equivalent section, so an implementer reading only plan.md would miss it.
- **Fix**: Lift the plan-brief's first Open Risk paragraph into plan.md — either into Current State Analysis (as an accepted constraint) or a new short "Open Risks & Assumptions" section.
- **Decision**: FIXED (added "Open Risks & Assumptions" section to plan.md between "Current State Analysis" and "What We're NOT Doing" covering all three plan-brief Open Risks; folded during the F1 fix pass)
