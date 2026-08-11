<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Multiple Sessions per Group + Host-Only Cancellation

- **Plan**: `context/changes/multi-sessions-and-cancel/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-11
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

7/7 paths ✓, 6/6 symbols ✓, brief↔plan ✓. Blast-radius check: `getNextUpcomingSession` has exactly one importer (`groups/[id].astro:7`), matching the plan's "one caller" claim — safe to retire.

## Findings

### F1 — sessionByDate Map hides ✗ from the correct host when two sessions share a day

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 3 — Change 3 (GroupCalendar prop change) contract
- **Detail**: The plan lists "no per-day cap" as a scope decision but the Phase 3 right-column lookup uses `new Map<string, ConfirmedSession>((confirmedSessions ?? []).map((s) => [s.slot_date, s]))`. Map from array entries keeps only the LAST entry per key (not "earlier-hour wins" as the plan's parenthetical wrongly claims). More importantly: if host X confirms session A at day D 15:00 and host Y confirms session B at day D 20:00, the map collapses to session B. Host X viewing gets `iAmHost = false` and cannot cancel session A from the UI — breaking the desired end state ("the session's host — and only that host — sees a ✗ button on the day that session lives").
- **Fix**: Replace the Map with a per-viewer `.find`: `const myHostedSessionOnDay = (confirmedSessions ?? []).find((s) => s.slot_date === day && s.iAmHost);`. If found → ✗ button targets it; else fall through to existing ✓ logic. Guarantees each host reaches their own cancel affordance regardless of same-day cross-host sessions. Delete the stale parenthetical about "earlier-hour wins".
- **Decision**: FIXED (Change 3 rewritten to use per-viewer `.find`; two edits — the lookup construct and the button-visibility condition — both point at `myHostedSessionOnDay`)
