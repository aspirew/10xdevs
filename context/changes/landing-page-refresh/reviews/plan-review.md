<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Landing Page + App-Wide Visual Identity Refresh

- **Plan**: `context/changes/landing-page-refresh/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-11
- **Verdict**: REVISE → SOUND (all 6 findings triaged and fixed in plan)
- **Findings**: 2 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING → PASS after fixes |
| Blind Spots | WARNING → PASS after fixes |
| Plan Completeness | FAIL → PASS after fixes |

## Grounding

19/19 paths ✓, 1/1 symbol (`bg-cosmic` at `global.css:113`) ✓, 2/2 npm scripts (`typecheck`, `lint`) ✓, brief↔plan ✓

## Findings

### F1 — Plan uses pnpm commands; project runs on npm

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phases 1/2/3 Success Criteria + Testing Strategy step 1 + Migration Notes
- **Detail**: Every automated criterion and the manual smoke step used `pnpm typecheck` / `pnpm lint` / `pnpm dev` / `pnpm build`. The repo has `package-lock.json` and no `pnpm-lock.yaml`; scripts wired for `npm run typecheck` (= `astro check`) and `npm run lint` (= `eslint .`). Running the plan verbatim yielded `command not found: pnpm` or forced pnpm install.
- **Fix**: Global-replace `pnpm typecheck` / `pnpm lint` / `pnpm dev` / `pnpm build` / `pnpm install` with `npm run typecheck` / `npm run lint` / `npm run dev` / `npm run build` / `npm install`. 10 call sites total.
- **Decision**: FIXED

### F2 — Phase 3 collapses GroupCalendar's multi-state cell semantics

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architectural Fitness / Blind Spots
- **Location**: Phase 3 change #3 (GroupCalendar.tsx) + Palette table
- **Detail**: Plan described the cell recolour as swapping "a blue/purple ramp" for "an amber/orange ramp". Actual code (`GroupCalendar.tsx:245-263`) encodes TWO orthogonal semantic axes — blue = YOU (your explicit start + your available range), purple = GROUP overlap threshold met (FR-008 wedge). Plus a confirmed-session ★, a push-fail day marker, and a confirm-button focus/hover ring at `:324`. Naive grep-and-swap to amber destroys the axis distinction and users can't tell "my slot" from "group hot slot" from "confirmed session".
- **Fix**: Extended palette table with a full two-axis mapping table (YOU=amber, GROUP=emerald), specified confirm-button base/hover/focus, and rewrote Phase 3 change #3 Intent+Contract to point at it. Priority logic unchanged.
- **Decision**: FIXED

### F3 — Phase 3 stop-condition grep misses palette variants

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 3 automated criterion 3.3 + Testing Strategy step 7
- **Detail**: Pattern missed `from-purple-`, `to-purple-`, `text-blue-200`, `focus:ring-purple-`, `focus:border-purple-`, `ring-purple-`, `border-purple-`. Automated stop condition would report clean while stragglers remained — false confidence worse than no check.
- **Fix**: Expanded pattern to `bg-cosmic|from-blue-|via-purple-|to-pink-|from-purple-|to-purple-|bg-purple-[0-9]|bg-blue-[0-9]|bg-indigo-[0-9]|text-purple-[0-9]|text-blue-|ring-purple-|border-purple-|border-white/[0-9]|bg-white/[0-9]`. Applied in three places (criterion 3.3, Progress checklist 3.3, Testing Strategy step 7).
- **Decision**: FIXED

### F4 — Recurring section-heading gradient has no canonical replacement

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness / Plan Completeness
- **Location**: Phase 3 changes #4 and #5
- **Detail**: 8 occurrences of `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent` across 6 files (signin:11, signup:11, groups/new:20, groups/index:61, groups/[id]:121+147, invite/[token]:51+75). Plus a second variant `from-purple-200 to-pink-200` on the nextSession banner at `[id]:212`. Plan said "swap direct utilities" per-file but didn't pin canonical replacements — 6 files would diverge.
- **Fix**: Added "Recurring composed effects" section to Critical Implementation Details defining ONE canonical section-heading gradient (`from-amber-200 via-amber-300 to-orange-200`), ONE emphasis-banner gradient (`from-amber-300 to-orange-200`), and ONE emphasis-banner surround (`border-emerald-400/30 bg-emerald-500/15`). Rewrote all four affected Phase 3 change contracts (signin, signup, groups/*, invite) to reference them by name.
- **Decision**: FIXED

### F5 — NotificationControls listed in Phase 3 but has no direct-utility work

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution / Plan Completeness
- **Location**: Phase 3 change #2
- **Detail**: File uses only shadcn tokens (`text-muted-foreground`, `text-destructive`) and the `<Button>` component. Zero direct-utility references. Phase 1 already touches its rendering.
- **Fix**: Rewrote the change entry as "**no changes needed**" with a note that Phase 1 covers it and that the invisible-button issue is sibling-ticket scope.
- **Decision**: FIXED

### F6 — Plan claim "shadcn tokens effectively unused" is wrong

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Current State Analysis + Phase 1 Overview
- **Detail**: shadcn `<Button>` (`ui/button.tsx`) and `NotificationControls` consume tokens. Phase 1's token flip has broader visible reach than stated. Also interacts with sibling ticket `fix-notification-controls` (invisible unsubscribe button) — Phase 1 changes what that button looks like on the tavern palette.
- **Fix**: Corrected Current State Analysis paragraph to list the actual consumers (`ui/button.tsx`, `NotificationControls.tsx`) with specific tokens. Added a "Phase 1 reach note" + "Sequencing with sibling ticket `fix-notification-controls`" block to Phase 1 Overview flagging that Phase 1 should land before the sibling ticket starts.
- **Decision**: FIXED
