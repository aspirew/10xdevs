# Google-Only Sign-In + Conditional Landing CTA + Member Names — Plan Brief

> Full plan: `context/changes/google-only-signin-and-name-display/plan.md`

## What & Why

Consolidate the auth UX around Google OAuth as the only sign-in path (email/password was never wired up correctly anyway — `SignUpForm.tsx` posted to a nonexistent endpoint). Drop every Sign-up affordance, delete the orphaned `/auth/signup` route + form components, make the landing page CTA conditional on auth state with a Google-name greeting when signed in, and show member display names on the group-detail page instead of raw emails only.

## Starting Point

Google OAuth already handles all real sign-ins via `signin.astro`'s inline `<form action="/api/auth/oauth/google">`. `SignInForm.tsx` and `SignUpForm.tsx` are dead code — never imported except in `void React;` sentinel comments. Sign-up references live in Topbar (signed-out branch), Welcome (landing CTA), and signin.astro's footer. Landing page (`Welcome.astro`) doesn't read `Astro.locals.user` today. Group detail (`groups/[id].astro`) fetches members via `admin.auth.admin.getUserById(uid)` but only stores `email` — `full_name` from `user_metadata` is available on the same response.

## Desired End State

Attempting `/auth/signup` returns 404. Signed-out landing shows the caption + a single "Sign in" button; signed-in landing shows "Hello \<name\>" + a "Go to groups" button. Signed-out Topbar reads `[logo] | Sign in`. Groups detail page members list reads `Name (email)` per row (email in lighter styling), with `(you)` and `creator` badges preserved. Members whose Google account has no `full_name` fall back to email-only. Zero dead sign-up/sign-in-form code remains.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Dead-code cleanup scope | Delete `signup.astro`, `SignUpForm.tsx`, `SignInForm.tsx` | All three confirmed dead; leaving them causes footguns (SignUpForm posts to a nonexistent endpoint). |
| Auth sub-components (`FormField`, `PasswordToggle`, etc.) | Grep during implementation; delete only what's confirmed unused | Avoids over-scoped deletions if any are used elsewhere. |
| Name source | `user.user_metadata.full_name` | Google's OAuth already provides this; verified in captured JWTs. |
| Name fallback | `full_name` → email prefix (`x@y.com` → `x`) → `"there"` | Handles rare metadata gaps without breaking rendering. |
| Landing signed-in greeting | Replace the "Never miss a chance…" caption with "Hello \<name\>" + tagline | The greeting is more relevant to a signed-in user than the marketing pitch. |
| Signed-in CTA text | "Go to groups" | Direct, action-first, single word "groups" matches the destination route label. |
| Members display format | `Name (email)` with email in `text-amber-100/50` for visual hierarchy | Name primary, email secondary; parens signal supplemental info. |
| Members without full_name | Just show email, no parens | Rare edge case; less jarring than a placeholder. |
| `/auth/signup` redirect | No redirect; 404 is fine | No external inbound links at friend-group scale. |
| Automated tests | None | Consistent with prior slices. |

## Scope

**In scope:**
- Delete: `src/pages/auth/signup.astro`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SignInForm.tsx`
- Edit: `src/components/Topbar.astro` (drop signed-out Sign up link), `src/components/Welcome.astro` (conditional CTA + greeting), `src/pages/auth/signin.astro` (drop footer paragraph), `src/pages/groups/[id].astro` (fetch full_name + render Name (email))
- Grep-verified deletion of any auth sub-components confirmed unused

**Out of scope:**
- Adding back email/password sign-in
- `/api/auth/signup` handler (was never present; not being added)
- Middleware redirect for `/auth/signup`
- User profile editing (name/avatar)
- New database columns (full_name is read from Supabase's built-in `auth.users.user_metadata`)
- User avatar display
- i18n / l10n
- Automated tests

## Architecture / Approach

Single-phase surgical edit across 4 files + 3 deletions. No new modules, no new deps, no schema. Verify via typecheck + lint + build + `grep` sanity checks + manual smoke on both auth states of the landing page + members list on the group detail page.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Google-only auth cleanup + name display | Signup gone; landing CTA conditional with Google-name greeting; groups detail shows `Name (email)` | Low — surgical edits; grep verifies dead-code cleanup; existing OAuth path is unchanged. |

**Prerequisites:**
- Google OAuth is working (verified across every prior ticket)
- User has `user_metadata.full_name` in Supabase (verified for the primary tester)

**Estimated effort:** ~45 min (7 changes across 7 files; more complex than a single-rename ticket but each change is straightforward).

## Open Risks & Assumptions

- **Assumption: `user_metadata.full_name` is present for every Google-signed-in user.** True for anyone signing in fresh via Google. Fallback chain handles the edge case where it's missing.
- **Assumption: no auth sub-component is imported from elsewhere.** Verified during implementation via targeted grep before any deletion beyond the three top-level dead files.
- **Assumption: friend-group-scale privacy tolerates showing `full_name` alongside email in the members list.** Members already see each other's emails — adding names is directionally the same info. Real-user validation may push back; can iterate.

## Success Criteria (Summary)

- No sign-up UI anywhere in the app; `/auth/signup` 404s.
- Signed-out visitors get a single "Sign in" CTA on landing + in Topbar.
- Signed-in visitors get a "Hello \<Google name\>" greeting + "Go to groups" CTA on landing.
- Group detail members list reads `Name (email)` per row with existing badges preserved.
- `grep -rn "Sign up\|signup\|SignUpForm\|SignInForm" src/` returns 0.
