# Google-Only Sign-In + Conditional Landing CTA + Member Names Implementation Plan

## Overview

Consolidate the auth surface around Google OAuth as the sole sign-in path: drop every Sign-up affordance from the UI (Topbar, landing page, /signin footer), delete the orphaned `/auth/signup` route and its form component (plus the dead `SignInForm.tsx`). On the landing page, make the CTA conditional — signed-out visitors get a "Sign in" button; signed-in visitors get a "Go to groups" button and a "Hello \<name\>" greeting sourced from Google's `user_metadata.full_name`. On the group-detail page, display each member as `Name (email)` — pull `full_name` from the same auth-metadata source when fetching member identities.

## Current State Analysis

- **Only real sign-in path is already Google OAuth.** `src/pages/auth/signin.astro:30` renders an inline `<form method="POST" action="/api/auth/oauth/google">`; the standalone `SignInForm.tsx` React component is never imported. `SignUpForm.tsx:66` posts to `/api/auth/signup` — an endpoint that **does not exist** in `src/pages/api/auth/` (which only has `oauth/`, `signout.ts`).
- **Sign-up UI references** to remove:
  - `src/components/Topbar.astro:37-39` — signed-out branch `<a href="/auth/signup">Sign up</a>`
  - `src/components/Welcome.astro:43-46` — landing hero's second CTA button "Sign up"
  - `src/pages/auth/signin.astro:38-40` — footer paragraph `Don't have an account? <a href="/auth/signup">Sign up</a>`
- **Dead code confirmed:** `SignUpForm.tsx`, `SignInForm.tsx`, `signup.astro`. All safe to `git rm`. Shared auth sub-components (`FormField`, `PasswordToggle`, `ServerError`, `SubmitButton`) are only referenced by these dead files — but explicit blast-radius verification during implementation before deleting them.
- **Landing page (`Welcome.astro`) doesn't read `Astro.locals.user`** — needs to, to render the conditional CTA + greeting.
- **Groups detail page (`src/pages/groups/[id].astro:65-74`)** fetches each member's identity via `admin.auth.admin.getUserById(uid)` and stores only `email`. `full_name` is available on the same response at `userRecord.user?.user_metadata?.full_name`.
- **Google user_metadata reliably provides `full_name`.** Verified in captured JWT during S-03 development: `"full_name":"Rafal Behrendt"`. Non-Google-provisioned users (would need email/password path, which we're removing) may not have it — fallback strategy is required.

### Key Discoveries

- `SignUpForm.tsx` is broken code (posts to a nonexistent endpoint). The signup UI never actually worked end-to-end since the `/api/auth/signup` handler was never present in the repo. Deleting it removes a footgun.
- `full_name` shape from Google's OAuth id-token is unicode-safe display text (their normalized `given_name + family_name` join). No sanitization needed for HTML rendering — Astro's default text interpolation escapes.
- All Topbar mount sites already handle the auth state — `Welcome.astro` also mounts `<Topbar />`, so the Topbar changes apply on the landing page too.

## Desired End State

- Attempting to navigate to `/auth/signup` returns 404 (route deleted).
- `Topbar.astro` signed-out branch: `[logo] | Sign in` (no Sign up link).
- `signin.astro`: the "Don't have an account? Sign up" footer paragraph is gone.
- `Welcome.astro` landing hero:
  - Signed-out: shows the current caption + a single "Sign in" button (Sign up button gone).
  - Signed-in: shows "Hello \<name\>" + a subtitle-esque tagline + a "Go to groups" button linking to `/groups`.
- `groups/[id].astro` member list: each entry reads `Name (email)` — name in default weight, email in parens with lighter styling. "(you)" / "creator" badges preserved. Members without a `full_name` fall back to just the email (no parens, no placeholder).
- No dead code left: `SignUpForm.tsx`, `SignInForm.tsx`, `signup.astro` removed. Any auth sub-components proven unused during implementation get removed too; ones with unclear usage stay.
- `NotificationControls.tsx:63` `next=/settings` redirect unchanged (already handled in previous ticket).

Verification: `grep -rn "Sign up\|signup\|SignUpForm\|SignInForm" src/` returns zero hits; `curl -s -o /dev/null -w "%{http_code}" https://10xdevs-lilac.vercel.app/auth/signup` returns 404; on prod, landing page shows the expected CTA per auth state; group detail page shows names in the members list.

## What We're NOT Doing

- No email/password path. Removing sign-up implicitly means new users can only join via Google OAuth (and only via an invite link — group_members is invite-only per S-01).
- No email/password sign-in retention as a fallback. If the OAuth provider goes down, users can't sign in. Acceptable at friend-group scale.
- No new endpoint for user profile editing (name/avatar/etc.). What Google provides is what we use.
- No new database schema. `full_name` is read directly from `auth.users.user_metadata` — Supabase's built-in shape.
- No `/api/auth/signup` handler will be added — the ticket is to REMOVE the sign-up flow, not fix its broken endpoint.
- No i18n or l10n. The greeting is English-only ("Hello \<name\>").
- No user avatar display. `user_metadata.avatar_url` is available from Google but not requested by the ticket.
- No middleware redirect from `/auth/signup` → `/auth/signin`. 404 is fine; there are no external inbound links.
- No admin-only view. `full_name` is displayed to all group members (privacy-adjacent: friends knowing each other's Google display name is fine at friend-group scale).
- No automated tests (consistent with project convention — manual smoke).

## Implementation Approach

Single phase. Two logical clusters: (a) sign-up removal / dead-code cleanup, and (b) name-display features. All edits are surgical; no ordering constraint besides doing the cleanup before running the automated verification greps.

Verify via typecheck + lint + build + a set of `grep` sanity checks + manual smoke on landing (both auth states) + groups detail page.

## Phase 1: Google-only auth cleanup + name display

### Overview

Delete `/auth/signup` and its React form; remove Sign-up references from Topbar, Welcome, and signin.astro's footer; wire the landing page to `Astro.locals.user` for the conditional CTA + greeting; extend the groups-detail member fetch to grab `full_name` and render `Name (email)`.

### Changes Required

#### 1. Delete /auth/signup page

**File**: `src/pages/auth/signup.astro` (delete via `git rm`)

**Intent**: The signup page is no longer reachable from the UI after this phase; the endpoint it posted to (`/api/auth/signup`) doesn't exist anyway. Direct navigation to `/auth/signup` should 404.

**Contract**: `git rm src/pages/auth/signup.astro`. No redirect, no middleware entry.

#### 2. Delete SignUpForm React component

**File**: `src/components/auth/SignUpForm.tsx` (delete via `git rm`)

**Intent**: Only reference is the `signup.astro` page (deleted in Change 1). Remove the file to avoid dead-code drift.

**Contract**: `git rm src/components/auth/SignUpForm.tsx`.

#### 3. Delete SignInForm + auth sub-components (dead code)

**Files**: `src/components/auth/SignInForm.tsx`, `src/components/auth/FormField.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/ServerError.tsx` (all delete via `git rm`)

**Intent**: `signin.astro` uses its own inline `<form>` element for OAuth submission; `SignInForm.tsx` is never imported. Its only mentions elsewhere are `void React;` sentinel comments in `GroupCalendar.tsx` / `ConfirmSessionDialog.tsx` / `CancelSessionDialog.tsx` — those comments explain the React import pattern and don't require the file to exist. Plan-review grep confirmed the four sub-components (`FormField`, `PasswordToggle`, `SubmitButton`, `ServerError`) are imported ONLY by `SignInForm.tsx` and `SignUpForm.tsx` — once both forms are deleted (Changes 2 and 3), the sub-components are dead code too.

**Contract**: `git rm` all five files. As a defensive check, re-grep for `SignInForm\|FormField\|PasswordToggle\|SubmitButton\|ServerError` before deletion in case a new caller landed since this plan was written; if grep hits anything outside `src/components/auth/` and the sentinel comments in `GroupCalendar.tsx` / `ConfirmSessionDialog.tsx` / `CancelSessionDialog.tsx`, pause and reconsider that specific file.

#### 3a. Update stale `void React;` sentinel comments

**Files**: `src/components/GroupCalendar.tsx`, `src/components/ConfirmSessionDialog.tsx`, `src/components/CancelSessionDialog.tsx`

**Intent**: Each of these files has a leading comment on the `void React;` line that references `SignInForm.tsx` as the pattern origin. Once SignInForm is deleted the reference is stale doc drift — the comment still correctly explains WHY the sentinel exists, but a future reader searching for SignInForm.tsx to understand the pattern will hit a dead end.

**Contract**: In each of the three files, rewrite the leading comment to remove the "mirror SignInForm.tsx" (or equivalent) phrase; keep the `jsx: "react-jsx"` + Astro 6 + Vite / `jsxDEV is not a function` rationale. One-line edit per file.

#### 4. Topbar — drop Sign up from signed-out branch

**File**: `src/components/Topbar.astro`

**Intent**: Remove the signed-out `<a href="/auth/signup">Sign up</a>` link. Result: signed-out nav reads `[logo] | Sign in`.

**Contract**: Delete the `<a href="/auth/signup" ...>Sign up</a>` element in the signed-out branch (currently the second-to-last child of the `<div class="flex gap-3">` wrapper). Sign in link stays.

#### 5. signin.astro — drop the "Don't have an account? Sign up" footer

**File**: `src/pages/auth/signin.astro`

**Intent**: Remove the `<p>Don't have an account? <a href="/auth/signup">Sign up</a></p>` paragraph. The Google button is the only affordance on this page after the change.

**Contract**: Delete the `<p class="mt-4 text-center text-sm text-amber-100/60">...</p>` line at the bottom of the sign-in card.

#### 6. Welcome.astro — conditional CTA + "Hello \<name\>" greeting

**File**: `src/components/Welcome.astro`

**Intent**: Read `Astro.locals.user` in the frontmatter. In the hero section, replace the current caption + button-pair with a conditional block:
- Signed-out: keep the existing "Never miss a chance to play board games again." caption + a single "Sign in" button (drop the Sign up button).
- Signed-in: replace the caption with "Hello \<display_name\>" (rendered in the same amber-gradient h1 style already used for hero text, sized down slightly to accommodate names), plus a supporting tagline (e.g. the existing subtitle text), plus a single "Go to groups" button linking to `/groups`.

**Contract**:
- Frontmatter: `const { user } = Astro.locals;`
- Compute `displayName` inline (or via a small helper `?` block): prefer `user?.user_metadata?.full_name`; fall back to the substring of `user.email` before the `@`; fall back to `"there"`. This computation is only used when `user !== null`.
- Hero block: `{user ? (...signed-in...) : (...signed-out...)}` pattern, matching the same `{user ? ... : ...}` structure Topbar.astro already uses so the code reads consistently.
- Signed-in "Sign in" button link retained on the signed-out branch: `href="/auth/signin"` (unchanged from the current single Sign-in button; only the sibling Sign-up button is removed). Signed-in branch's "Go to groups" button: `href="/groups"` with visually equivalent styling to the Sign-in button (same amber-500 primary look).
- Preserve the existing feature-cards section below the hero unchanged (`Shared availability` / `Overlap at a glance` / `Push on confirm`).
- Preserve the atmospheric orbs + dust background layers.

#### 7. groups/[id].astro — fetch full_name; render "Name (email)"

**File**: `src/pages/groups/[id].astro`

**Intent**: Extend the members-fetch loop to also grab `user_metadata.full_name`; render each member as `Name (email)` with email in lighter styling. Keep "(you)" and "creator" badges. When `full_name` is null, fall back to just the email (no parens).

**Contract**:
- Extend the `members` type: `{ id: string; email: string | null; full_name: string | null }[]` (line 65).
- In the `getUserById` loop (line 68–72), return `{ id: uid, email: ..., full_name: userRecord.user?.user_metadata?.full_name ?? null }`.
- In the member list render (line 199–205): show `<span>{m.full_name ?? m.email ?? m.id}</span>` as the primary text, followed by `{m.full_name && m.email && <span class="ml-2 text-amber-100/50">({m.email})</span>}` for the email-in-parens variant. Preserve `(you)` / `creator` badges.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- `grep -rn "Sign up" src/` returns 0
- `grep -rn "signup" src/` returns 0
- `grep -rn "SignUpForm\|SignInForm" src/` returns 0
- `ls src/pages/auth/` does not include `signup.astro`
- `ls src/components/auth/SignUpForm.tsx src/components/auth/SignInForm.tsx 2>/dev/null` returns 2 "No such file" messages (0 files matched)
- `grep -c "user.user_metadata" src/components/Welcome.astro` returns ≥ 1 (Welcome reads the metadata)
- `grep -c "full_name" src/pages/groups/[id].astro` returns ≥ 2 (fetch + render)

#### Manual Verification

- On prod, direct visit to `https://10xdevs-lilac.vercel.app/auth/signup` returns 404
- Signed-out on landing (`/`): hero shows the "Never miss a chance…" caption and a single "Sign in" button (no Sign up)
- Signed-out Topbar reads `[logo] | Sign in`
- Signed-in on landing (`/`): hero shows "Hello \<your Google name\>" and a "Go to groups" button that routes to `/groups`
- Signed-in Topbar reads `[logo] | Groups | Settings | Sign out` (unchanged from prior ticket)
- On `/groups/<id>`: members list shows each member as `Name (email)`; your own row shows `Name (email) (you)` (or creator badge for the group creator)
- If a member has no `full_name` (test with a member whose user_metadata is missing — likely none in current group, but the code path is exercisable), only the email is shown
- Sign-in flow still works end-to-end: unauth visitor → "Sign in" button → Google → back on landing signed-in with greeting
- No console errors on any of the above
- Tag production deploy as `prod-<date>-google-only-auth` after production smoke passes

**Implementation Note**: After Phase 1 lands and all manual verification passes, this slice is complete.

## Testing Strategy

### Manual Testing Steps

1. Signed-out: land on `/` → see caption + single Sign in button; click → Google OAuth → land back on `/` signed-in.
2. Signed-in: `/` shows "Hello \<name\>" + "Go to groups"; click → land on `/groups`.
3. `/groups/<id>`: verify members list has `Name (email)` format; verify (you) and creator badges are still where they should be.
4. Direct-visit `/auth/signup` → verify 404.
5. Direct-visit `/auth/signin` → verify no "Don't have an account? Sign up" footer under the Google button.

## References

- Ticket source: `context/changes/google-only-signin-and-name-display/change.md`
- Files edited: `src/components/Topbar.astro`, `src/components/Welcome.astro`, `src/pages/auth/signin.astro`, `src/pages/groups/[id].astro`
- Files deleted: `src/pages/auth/signup.astro`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SignInForm.tsx`
- Data source for `full_name`: Supabase `admin.auth.admin.getUserById(uid).user.user_metadata.full_name` (Google-provided)
- Existing invite flow (unchanged; new members still join via `/invite/<token>`): `src/pages/invite/[token].astro`
- Existing OAuth handler: `src/pages/api/auth/oauth/google.ts` (unchanged)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Google-only auth cleanup + name display

#### Automated

- [x] 1.1 `npm run typecheck` passes — 8821b56
- [x] 1.2 `npm run lint` passes — 8821b56
- [x] 1.3 `npm run build` succeeds — 8821b56
- [x] 1.4 `grep -rn "Sign up" src/` returns 0 — 8821b56
- [x] 1.5 `grep -rn "signup" src/` returns 0 — 8821b56
- [x] 1.6 `grep -rn "SignUpForm\|SignInForm" src/` returns 0 — 8821b56
- [x] 1.7 `ls src/pages/auth/` does not include `signup.astro` — 8821b56
- [x] 1.8 `src/components/auth/SignUpForm.tsx` and `src/components/auth/SignInForm.tsx` do not exist — 8821b56
- [x] 1.9 `grep -c "user_metadata" src/components/Welcome.astro` returns ≥ 1 — 8821b56
- [x] 1.10 `grep -c "full_name" src/pages/groups/[id].astro` returns ≥ 2 — 8821b56

#### Manual

- [x] 1.11 Prod direct-visit to `/auth/signup` returns 404 — a0251a7
- [x] 1.12 Signed-out landing shows the "Never miss a chance…" caption and a single "Sign in" button (no Sign up) — a0251a7
- [x] 1.13 Signed-out Topbar reads `[logo] | Sign in` — a0251a7
- [x] 1.14 Signed-in landing shows "Hello \<Google name\>" and a "Go to groups" button that routes to `/groups` — a0251a7
- [x] 1.15 On `/groups/<id>`: members list shows `Name (email)` per row; `(you)` and `creator` badges preserved — a0251a7
- [x] 1.16 Members without `full_name` fall back to just email (no parens) — a0251a7
- [x] 1.17 Sign-in flow works end-to-end (unauth → Sign in → Google → back on landing signed-in) — a0251a7
- [x] 1.18 Signed-in Topbar unchanged: `[logo] | Groups | Settings | Sign out` — a0251a7
- [x] 1.19 No console errors on any of the above — a0251a7
- [x] 1.20 Tag production deploy as `prod-<date>-google-only-auth` — prod-2026-08-14-google-only-auth
