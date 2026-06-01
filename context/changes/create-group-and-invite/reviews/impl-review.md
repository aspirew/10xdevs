<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create a Friend Group and Invite Friends

- **Plan**: `context/changes/create-group-and-invite/plan.md`
- **Scope**: Full plan (Phase 1 + Phase 2 + Phase 3)
- **Date**: 2026-06-02
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING (2 LOW-impact findings, both skipped) |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING (1 LOW-impact finding, skipped) |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Notes

- 25 files changed across Prereqs + 3 code phases. Diff matches plan expectations exactly (no scope creep).
- Path-3 RLS workaround consistently applied: every `createAdminClient()` site is at one of the 5 intended places. The 4 files that still import the user-scoped `@/lib/supabase` only use it for `supabase.auth.*` methods (middleware, signout, oauth/google, callback) — those go through the Supabase Auth API code path which works correctly.
- All `"What We're NOT Doing"` guardrails respected (no sessions, no availability, no real-time, no tests, no leave-group UI, no domain, no multi-invite-tokens).
- All 25 Progress rows checked + SHA-stamped. Automated criteria (lint, typecheck, build) re-verified at review time, all green.
- Lessons.md gained a substantial new entry ("Verify PostgREST honors auth.uid() before relying on RLS as the auth gate on Supabase projects") — captures the Path-3 finding as a permanent prior for future Supabase-RLS-dependent planning.
- Two impl-time adaptations both driven by lessons.md rule #1 ("verify integration claims empirically"): Phase 2 cookie hand-off (replaced `?next=` query thread-through) and Phase 3 Path-3 workaround (replaced user-scoped client + RLS gate with admin client + middleware-verified locals.user).

## Findings

### F1 — shadcn primitives installed but never imported; new pages use inline-styled elements

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/components/ui/{card,input,label}.tsx` (installed, unused); `src/pages/groups/{index,new,[id]}.astro` (use inline classes)
- **Detail**: Plan Phase 3 #1 added shadcn `card`, `input`, `label` via the CLI; contracts called for `<Card>` and "form styled with shadcn primitives". Actual implementation uses inline-styled `<li><a>` and `<input>` / `<label>` elements with Tailwind classes copied from the existing F-01 glass-card style. Aesthetic matches the rest of the app, so visually there's no drift; but the shadcn install is dead weight.
- **Fix**: Decide later — keep dead components for future use, OR delete them, OR refactor pages to use them. Friend-group v1 ships either way.
- **Decision**: SKIPPED — keep installed for future use; revisit at next touch.

### F2 — regenerate-invite uses app-side `crypto.randomUUID()` vs plan's DB-side `gen_random_uuid()::text`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/api/groups/[id]/regenerate-invite.ts:23`
- **Detail**: Plan contract specified `UPDATE groups SET invite_token = gen_random_uuid()::text`. Actual implementation computes `crypto.randomUUID()` in Node and passes it as a parameter. Both produce a 36-char UUID v4 with identical entropy; no security or correctness impact. The supabase-js-idiomatic path.
- **Fix**: Leave as-is.
- **Decision**: SKIPPED — supabase-js-idiomatic path, no real difference.

### F3 — `/groups/[id].astro` loops `admin.auth.admin.getUserById()` per member; O(N) admin API calls

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (performance)
- **Location**: `src/pages/groups/[id].astro:60-65`
- **Detail**: Member-email join uses `Promise.all(memberIds.map(uid => admin.auth.admin.getUserById(uid)))` — one parallel admin API call per member. Friend-group v1 scale (~5-10 members) is invisibly cheap. At hundreds of members it would become a real latency tax. Long-term remedy: denormalize `email` into `group_members` at join time, fed by an Edge Function or trigger.
- **Fix**: Document as a known scale limit; revisit if any group exceeds ~50 members (won't happen in v1).
- **Decision**: SKIPPED — accepted as known scale limit; out of scope for v1.
