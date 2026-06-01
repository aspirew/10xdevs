# Google OAuth Sign-in — Plan Brief

> Full plan: `context/changes/google-oauth-signin/plan.md`

## What & Why

Wire Google OAuth sign-in end-to-end on top of the existing Supabase + `@supabase/ssr` scaffold so a person can click "Continue with Google" and end the round-trip with a session cookie set. Delivers PRD FR-001 + §Access Control ("No passwords are created or stored on our side") and unlocks every downstream slice (S-01, S-02, S-03), all of which depend on a signed-in user.

## Starting Point

The auth substrate is wired but no OAuth path exists: `src/lib/supabase.ts` already does cookie-based SSR sessions via `@supabase/ssr`; `src/middleware.ts` already gates `/dashboard`; `supabase/config.toml` has `[auth.external.google]` enabled with `env()` substitution; the Supabase ↔ Vercel integration auto-syncs preview redirect URIs. What's missing: a `signInWithOAuth` call site, a `/auth/callback` route, the Google CTA on the auth pages, and the Google Cloud OAuth client (deferred from `deploy-plan.md` Phase 2 step 10 to this change).

## Desired End State

`https://10xdevs-lilac.vercel.app/auth/signin` shows one button — "Continue with Google". Clicking it runs the OAuth round-trip and lands the user signed-in on `/`, with `/dashboard` reachable. The same flow works locally at `http://localhost:4321` against the hosted Supabase project. Failures surface as `?error=…` on `/auth/signin` using the existing `ServerError` component.

## Key Decisions Made

| Decision                                          | Choice                                                                                                                                  | Why (1 sentence)                                                                                                                                  | Source |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| OAuth flow type                                   | PKCE via server-side `signInWithOAuth` + `/auth/callback` `exchangeCodeForSession`                                                      | Matches `@supabase/ssr`'s cookie-based session model already in `src/lib/supabase.ts`; the canonical Supabase SSR pattern.                        | Plan   |
| Entry-point mechanics                             | `POST /api/auth/oauth/google` server endpoint redirects to Supabase's authorize URL                                                     | Mirrors the form-POST pattern of the existing `src/pages/api/auth/signin.ts` — no browser-side Supabase client to introduce.                      | Plan   |
| Email/password scaffold disposition (Open Q #3)   | Remove from rendered UI **and** delete the password-handling routes (`/api/auth/signin`, `/api/auth/signup`) + the orphaned `confirm-email.astro` page. Keep React form components in-tree (harmless dormant code). | Honors PRD §Access Control's "No passwords are created or stored on our side" literally — UI-only removal would still let `curl -X POST /api/auth/signup` create a password account. Reversible via `git revert` of the deletions. | Plan   |
| Callback redirect target                          | `/` on success, `/auth/signin?error=…` on failure                                                                                       | Matches the redirect target of the existing email/password handler; no `?next=` round-trip needed at friend-group scale.                          | Plan   |
| Preview-URL redirect-URI handling                 | Rely on the Vercel–Supabase integration's auto-sync; do not enumerate previews in `supabase/config.toml`                                | Documented in `infrastructure.md` as the integration's job; manual enumeration would fight the integration and drift.                             | Frame  |
| Where Google credentials live                     | Hosted Supabase Studio (Authentication → Providers → Google); **not** in Vercel env                                                     | Hosted Supabase reads credentials from Studio; the `.env.example` Google keys feed only local `supabase start`'s `env()` substitution.            | Plan   |
| Local-dev OAuth testing strategy                  | `npm run dev` against hosted Supabase (env pulled via `vercel env pull`); local `supabase start` Google flow explicitly out of scope    | Standing up local Google + local Supabase requires a second OAuth client and configuration; not gating FR-001 and against `time` blocker.         | Plan   |
| Tests                                             | None added — `npm run lint` + `npm run build` (typecheck) is the automated bar; rest is manual browser smoke                            | No test suite exists in the starter; adding one is its own change.                                                                                | Plan   |

## Scope

**In scope:**
- New server routes: `POST /api/auth/oauth/google` (start) and `GET /auth/callback` (PKCE exchange).
- UI: `src/pages/auth/signin.astro` and `src/pages/auth/signup.astro` reduced to a single Google CTA.
- Allowlist: `supabase/config.toml` `additional_redirect_urls` extended for localhost + production callback paths.
- `.env.example` comment clarification — those vars feed local `supabase start` only.
- Google Cloud OAuth client creation (human-only step inside this change).
- Hosted Supabase Studio Google provider activation (human-only step inside this change).

**Out of scope:**
- Removing the email/password code (`/api/auth/{signin,signup}.ts`, `SignInForm`/`SignUpForm` components) — kept dormant.
- Local `supabase start` Google OAuth setup.
- Custom domain attach (deferred per `infrastructure.md` risk register).
- `?next=` post-login redirect routing.
- Any S-01/S-02/S-03 domain code (groups, availability, sessions).
- Tests (none exist; adding a framework is not justified by FR-001 alone).

## Architecture / Approach

```
Browser  ──POST──▶  /api/auth/oauth/google  ──signInWithOAuth──▶  Supabase
   │                       │                                       │
   │                       └──302──▶  data.url (Google consent screen)
   │                                          │
   │  ◀────── Google consent ───────────────  ┘
   │                                          │
   │                                          ▼
   │   Google → https://<project>.supabase.co/auth/v1/callback ─┐
   │                                                            │
   ◀── 302 to /auth/callback?code=… ──────────────────────────┘
   │
   ▼
/auth/callback (GET)  ──exchangeCodeForSession──▶  Supabase
        │  (cookies set by @supabase/ssr's setAll hook in src/lib/supabase.ts)
        └──302──▶  /  (signed in; middleware now populates Astro.locals.user)
```

PKCE flow throughout. The existing `src/lib/supabase.ts` factory needs no changes — its `setAll` cookie hook lands the session on `exchangeCodeForSession`. `src/middleware.ts` then reads cookies → user on every subsequent request, including `/dashboard`.

## Phases at a Glance

| Phase                                                   | What it delivers                                                                                                          | Key risk                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Code wiring — OAuth endpoints + Google-only UI       | Two new server routes, Google-only signin/signup pages, redirect URLs allowlisted in `supabase/config.toml`               | Server-side `signInWithOAuth` returns `{ data: { url } }` without auto-redirecting (unlike browser client) — must explicitly redirect to `data.url`.    |
| 2. Provider activation + end-to-end verification        | Google Cloud OAuth client + Supabase Studio Google provider configured; full round-trip smoke-tested on localhost + prod  | Redirect-URI registration at Google Cloud must include the *Supabase* callback (`https://<project>.supabase.co/auth/v1/callback`), not our app URL.     |

**Prerequisites:**
- Supabase ↔ Vercel integration already installed and writing `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` to Vercel env (✅ per `deploy-plan.md` Phase 2 steps 7–9).
- Local `vercel env pull` produces a working `.env` for `npm run dev`.
- A Google Cloud account with permission to create an OAuth client (human, not agent).

**Estimated effort:** ~1 short session for Phase 1 (~9 files touched + 3 deletions: 2 new routes, 2 page rewrites, `supabase/config.toml`, `.env.example`, `package.json` typecheck script, 2 component typo fixes, and 3 deletions to neutralize the password surface — see Key Decisions row on email/password disposition). No tests to add. ~30–60 min wall-clock for Phase 2, dominated by Google Cloud Console + Supabase Studio clicks plus a preview-deploy verification round; majority of time is human-only.

## Open Risks & Assumptions

- **Assumption:** the Vercel–Supabase integration's preview-redirect-URI auto-sync still works as documented in `infrastructure.md`. If it has silently regressed, preview deploys will fail OAuth with `redirect_uri_mismatch`; mitigation = check Supabase Studio Redirect URLs after the first preview deploy.
- **Assumption:** hosted Supabase respects the Studio-configured Site URL + Redirect URLs at higher precedence than the local `supabase/config.toml` (since the local TOML is consumed only by `supabase start`). Both are updated in Phase 2 for consistency.
- **Risk:** the Google OAuth consent screen is in "Testing" mode (default for a new project); only listed Test Users can complete consent until the screen is verified. For a friend-group v1 this is the desired state — add each friend group member as a Test User during Phase 2 hand-off. Going to "In production" requires verification and is out of scope.
- **Risk:** Phase 1 ships a UI that visibly errors until Phase 2 lands. This is intentional — the code change should be reviewable / mergeable / rollback-able independently of the provider activation. Don't merge to `main` (or do, accepting the brief window where the prod page shows the error) until you're ready to land Phase 2.

## Success Criteria (Summary)

- A friend-group member can complete a Google sign-in round-trip on production and reach `/dashboard` — proves FR-001 end-to-end.
- The same round-trip works on `localhost:4321` against the hosted Supabase project — proves the dev loop for future S-01/S-02/S-03 work.
- The signin/signup pages display only the Google CTA; the dormant email/password code stays in the tree, ready to re-enable if the PRD decision flips.
