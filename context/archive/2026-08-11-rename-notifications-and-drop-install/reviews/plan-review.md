<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Rename Notifications → Settings + Drop Signed-Out Install

- **Plan**: `context/changes/rename-notifications-and-drop-install/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-13
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | WARNING |

## Grounding

3/3 paths ✓, 4/4 symbols ✓, brief↔plan ✓. Blast-radius sweep found:
- `NotificationControls.tsx:87` uses `next=/install` — safe (route stays)
- `install.astro:83` has an h2 card header `Notifications` (semantic, kept)
- `NotificationControls.tsx:74` uses "Notifications" in an error message (semantic, kept)
- `install.astro:31` has a subtitle paragraph containing "Install GameSlot" — plan explicitly says to keep it

## Findings

### F1 — Grep patterns for automated verification don't match the codebase

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Success Criteria (1.4–1.8) + matching Progress rows
- **Detail**: (a) Patterns using `>Text<` shape don't match the actual HTML where labels sit on their own line with leading whitespace — they return 0 both pre- and post-change, silently passing without proving anything. (b) Criterion 1.7 (`grep -c "Install GameSlot" returns 0`) contradicts the plan's Change 2 contract, which explicitly preserves the subtitle paragraph — that string appears in the subtitle too, so the correct post-change count is 1, not 0.
- **Fix**: Rewrite criteria 1.4–1.8 with patterns that work against the actual formatting (`grep -c "Notifications"` for text-only match; `grep -c 'href="/install"'` for anchor-count change; `grep -c 'title="GameSlot Settings"'` for the new Layout title; `grep -c "Install GameSlot" returns 1` because the subtitle stays).
- **Decision**: FIXED (patterns updated in plan.md Success Criteria block + matching Progress rows)
