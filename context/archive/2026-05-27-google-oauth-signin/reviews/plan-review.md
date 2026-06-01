<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Google OAuth Sign-in Implementation Plan

- **Plan**: `context/changes/google-oauth-signin/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-27
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 1 critical · 1 warning · 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

12/12 paths ✓, 6/6 symbols ✓, brief↔plan ✓ (1 minor mismatch resolved via F4)

## Findings

### F1 — `npm run build` does NOT run `astro check`; Phase 1.2 claim is false, and a latent type bug in the dormant code would trip a real check

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Completeness
- **Location**: plan.md "Phase 1 Success Criteria → Automated Verification"; Progress 1.2
- **Detail**: plan.md claims `npm run build` runs `astro check`. Verified false — `package.json` script `build` is `astro build` only; `@astrojs/check` is installed (peer dep for the language server / `astro check` CLI) but not invoked by `astro build`. Also: `src/components/auth/SignInForm.tsx:36` and `src/components/auth/SignUpForm.tsx:51` use `React.SubmitEvent<HTMLFormElement>` — not a real React type (correct is `React.FormEvent<…>`). Adding `astro check` to the script (the obvious fix) would fail the build on these dormant files.
- **Fix A ⭐ Recommended**: Drop the false claim; accept that automated typecheck isn't part of the Phase 1 bar.
  - Strength: Honest. Plan stays minimal. The type errors live in dormant code slated for removal by F2 — self-cleaning.
  - Tradeoff: No automated typecheck guard during Phase 1.
  - Confidence: HIGH — verified by reading scripts + live code.
  - Blind spot: If F2 chooses option B, the type errors persist.
- **Fix B**: Add `"typecheck": "astro check"` to package.json, run as Phase 1.2, fix the SubmitEvent typos (2-line change).
  - Strength: Real automated guard restored.
  - Tradeoff: Couples F1 and F2.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: Fixed via Fix B — added `typecheck` script and SignInForm/SignUpForm typo corrections to Phase 1, updated Progress + success criteria.

### F2 — Dormant `/api/auth/{signin,signup}` routes still process password POSTs from anyone who knows the URL; violates PRD §Access Control letter

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: plan.md "What We're NOT Doing" item #1; Desired End State
- **Detail**: Plan removes email/password forms from rendered UI but keeps the route files live. `curl -X POST .../api/auth/signup -d 'email=x&password=y'` on prod still creates a password Supabase user. PRD §Access Control is verbatim: "No passwords are created or stored on our side."
- **Fix A ⭐ Recommended**: Delete `signin.ts`, `signup.ts`, and `confirm-email.astro` (orphaned). Keep `signout.ts` (still in use) and the React components (harmless dormant).
  - Strength: Honors the PRD letter. Smallest neutralizing change. Resolves F4 brief-count quibble as a bonus.
  - Tradeoff: 3 deletions.
  - Confidence: HIGH — verified by grep that no other in-repo callers depend on them.
  - Blind spot: None — Topbar links to `/auth/signin` (page) keep working.
- **Fix B**: Keep all files; add a feature-flag guard returning 404 unless `ENABLE_PASSWORD_AUTH` env is set.
  - Strength: Toggleable.
  - Tradeoff: Premature abstraction.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: Fixed via Fix A — added Phase 1 changes #10/#11/#12 (deletions), expanded Phase 1 success criteria + Progress with curl-404 check, updated Migration Notes and brief's Key Decisions row.

### F3 — PKCE code_verifier cookie persistence isn't called out in Critical Implementation Details

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: plan.md "Critical Implementation Details"
- **Detail**: PKCE stores a `code_verifier` cookie when `signInWithOAuth` runs; the callback reads it. `@supabase/ssr` defaults to SameSite=Lax which permits the round-trip. Tightening to Strict would silently break sign-in.
- **Fix**: Add a 3rd bullet to Critical Implementation Details about SameSite=Lax requirement.
- **Decision**: Fixed.

### F4 — Brief said "5 files"; plan now changes 9 files + 3 deletions

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: plan-brief.md "Phases at a Glance → Estimated effort"
- **Detail**: Brief stale after F1+F2 changes.
- **Fix**: Updated brief's "Estimated effort" line to `~9 files touched + 3 deletions` with a per-file breakdown.
- **Decision**: Fixed.

### F5 — Preview-deploy OAuth verification has no Phase 2 step despite acknowledged risk

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: plan.md Phase 2 success criteria; plan-brief.md "Open Risks"
- **Detail**: Plan asserts the Vercel–Supabase integration auto-syncs preview redirect URIs. `deploy-plan.md` Phase 3 step 13 explicitly deferred this verification to FR-001 (this change). Phase 2 verified only localhost + prod.
- **Fix**: Add a Phase 2 manual step: open a no-op PR, run the Google sign-in round-trip against the preview URL, then close the PR.
- **Decision**: Fixed — added Progress step 2.5 (preview-deploy verification) and reindexed subsequent manual steps.
