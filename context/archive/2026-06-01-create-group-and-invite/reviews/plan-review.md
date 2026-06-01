<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Create a Friend Group and Invite Friends

- **Plan**: `context/changes/create-group-and-invite/plan.md`
- **Mode**: Deep
- **Date**: 2026-06-01
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 1 critical · 3 warnings · 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | WARNING |
| Architectural Fitness | WARNING |
| Blind Spots           | PASS    |
| Plan Completeness     | FAIL    |

## Grounding

11/11 paths ✓, 6/6 symbols ✓, brief↔plan ✓; new-path absences verified (`supabase/migrations`, `src/pages/{api/groups,invite,groups}`, `src/lib/supabase-admin.ts`).

## Findings

### F1 — Progress↔Phase 3 Manual mismatch: 10 plan-body bullets vs 9 Progress rows; Progress 3.15 maps to Testing Strategy

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: plan.md Phase 3 → Manual Verification vs ## Progress → Phase 3 → Manual
- **Detail**: Per references/progress-format.md, every Success Criteria bullet must have a matching Progress row. Phase 3 plan body had 10 manual bullets; Progress had 9 rows. "Copy the invite link" plan bullet had no Progress row; Progress 3.15 "RLS sanity" mapped to Testing Strategy item #4, not Phase 3 Manual Verification.
- **Fix**: Add RLS-sanity bullet to Phase 3 Manual Verification (lifted from Testing Strategy); fold "Copy the invite link" into 3.9 explicitly.
- **Decision**: Fixed via "Fix in plan" — Phase 3 body Manual reduced to 9 bullets via folding + RLS addition; Progress 3.9 updated to mention copy.

### F2 — Migration application path left ambiguous (Studio SQL editor OR `supabase db push`)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: plan.md Phase 1 → Changes #2
- **Detail**: Both paths produce the same DB state but have different downstream implications. Studio = doc-only migrations (no apply-tracking). CLI = `supabase_migrations.schema_migrations` row tracks each apply. Picking now prevents S-02/S-03 from re-litigating.
- **Fix A ⭐ Recommended**: Studio for v1; treat supabase/migrations/ as version-controlled schema history.
  - Strength: Lowest setup cost; matches v1 simplicity.
  - Tradeoff: No automated apply-tracking; large-migration copy-paste error-prone.
  - Confidence: HIGH for friend-group scale.
  - Blind spot: Convention becomes liability if team size grows.
- **Fix B**: Wire `supabase link` + `db push` as canonical path now.
  - Strength: Apply-tracking; canonical Supabase workflow; scales.
  - Tradeoff: Adds `supabase login` + `link` (~5 min) to Prerequisites.
  - Confidence: MEDIUM — none exercised here yet.
  - Blind spot: Auth token setup may have quirks.
- **Decision**: Fixed via Fix B — Prerequisites step 5 added (`supabase login`, `link`, gitignore `.supabase/`); Phase 1 #2 contract specifies `npx supabase db push` as the canonical apply path with Studio as emergency override only.

### F3 — Desired End State claims direct REST API behavior; no success criterion exercises REST directly

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: plan.md Desired End State (last sentence); Phase 3 Manual Verification
- **Detail**: Phase 3 manual 3.15 verifies "Group not found" via the browser — an app-layer projection of RLS, not RLS itself. A page-code bug could produce 404 for reasons unrelated to RLS, silently masking a regression of the privacy NFR.
- **Fix**: Add a Phase 3 manual step that curls Supabase's `/rest/v1/groups?id=eq.<id>` with the second user's JWT + anon key headers; assert `[]` response. Validates the actual RLS boundary.
- **Decision**: Fixed via "Fix in plan (curl + JWT)" — added Phase 3 manual bullet "RLS sanity (REST path)" + corresponding Progress 3.16; prod e2e shifted to Progress 3.17.

### F4 — Supabase's query-string merge in OAuth redirectTo (`?next=` + `?code=`) is unverified — lessons.md rule #1 directly applies

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: plan.md Phase 2 → Changes #6/#7
- **Detail**: Plan assumes Supabase correctly merges its own `?code=...` into a redirectTo that already has `?next=...`. If naive string-concat, the URL is malformed and `next` is lost silently. Lessons.md rule #1 says to verify integration claims empirically before relying on them.
- **Fix**: Add a Phase 2 manual step explicitly inspecting the URL the browser lands on after consent. Document cookie-based fallback if the merge fails.
- **Decision**: Fixed via "Fix in plan" — added Phase 2 manual bullet "Query-string-merge verification" + corresponding Progress 2.9; fallback path documented inline (5-min cookie hand-off in oauth/google.ts + callback.ts, deployed only if needed).

### F5 — Phase 3 change #8 explicitly labeled "(optional polish)" — under top_blocker=time, that's the obvious cut

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: plan.md Phase 3 → Changes #8 (`index.astro` / `Welcome.astro` authed-CTA refresh)
- **Detail**: The whole `index.astro` is marketing; Topbar already routes authed users to /groups; "Sign in / Sign up" buttons are harmless when clicked while authed.
- **Fix**: Remove change #8 from Phase 3.
- **Decision**: Fixed — change #8 contract replaced with a one-paragraph note explaining the cut and re-add criteria.

### F6 — PROTECTED_ROUTES listed as `['/groups', '/groups/new']` is redundant — `startsWith` matches both

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: plan.md Phase 3 → Changes #7
- **Detail**: Middleware's `pathname.startsWith(route)` means a single `/groups` entry covers `/groups`, `/groups/new`, AND `/groups/<id>`.
- **Fix**: Trim to `['/groups']` only.
- **Decision**: Fixed.

### F7 — OAuth `?next=` validation could be more rigorous (URL parsing vs startsWith heuristic)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: plan.md Critical Implementation Details + Phase 2 Changes #6/#7
- **Detail**: `startsWith("/") && !startsWith("//")` catches protocol-relative URLs but misses backslash-prefix edge cases. `new URL(next, base).origin === base.origin` is one extra line and rigorously closed.
- **Fix**: Replace heuristic with URL-parsing + origin equality.
- **Decision**: Fixed in Critical Implementation Details + both Phase 2 contracts (#6 oauth/google.ts and #7 callback.ts).
