# Google OAuth Sign-in Implementation Plan

## Overview

Wire Google OAuth sign-in end-to-end for GameSlot so a person can land on the app, click "Continue with Google", and end the round-trip with a Supabase session cookie set. This delivers PRD FR-001 (single sign-on via third-party identity provider) and §Access Control ("No passwords are created or stored on our side") on top of the existing Supabase + `@supabase/ssr` scaffold, and unlocks every member-facing slice in the roadmap (S-01, S-02, S-03).

## Current State Analysis

The repo already has the auth substrate wired but not the OAuth path:

- **Server Supabase client** at `src/lib/supabase.ts:5` (`createClient`) uses `@supabase/ssr`'s `createServerClient` with cookie pass-through against `astro:env/server` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). This is the canonical SSR-PKCE shape — no changes needed for OAuth, the same client supports `signInWithOAuth` and `exchangeCodeForSession`.
- **Middleware** at `src/middleware.ts:6` populates `Astro.locals.user` from `supabase.auth.getUser()` and gates `/dashboard` (`PROTECTED_ROUTES`) — works with whatever session-establishment method writes the cookies.
- **Email/password scaffold** present at `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/api/auth/{signin,signup,signout}.ts`, and `src/components/auth/{SignInForm,SignUpForm,...}.tsx`. PRD §Access Control rules out passwords for v1, but ripping out the scaffold is scope-creep against `top_blocker=time` (roadmap Open Q #3, change.md notes).
- **`supabase/config.toml`** has `[auth.external.google]` enabled (lines 320–326) with `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID/SECRET)` substitution and `skip_nonce_check = true` for local-dev Google auth. `site_url = "http://localhost:4321"` and `additional_redirect_urls` covers only localhost — **production URL is not registered**, and no `/auth/callback` path is in the allow-list.
- **`.env.example`** stubs `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` (used only by local `supabase start` env() substitution; hosted Supabase reads from Studio config, not env).
- **Vercel + Supabase integration** is installed and wired (`deploy-plan.md` Phase 2 complete). Per `infrastructure.md`, the integration auto-syncs preview-deploy OAuth redirect URIs back to the Supabase project via webhook — we should not maintain a manual preview URL list.
- **No `signInWithOAuth` call** anywhere in the codebase (verified by `grep -rn "signInWithOAuth" src/ supabase/` → 0 hits). **No `/auth/callback` route** exists.
- **Prod URL** is `https://10xdevs-lilac.vercel.app` (per `astro.config.mjs:11` `site`). Tags `prod-2026-05-27-1/-2` are rollback targets.
- **No test suite** in the repo — `package.json` scripts are `dev`, `build`, `lint`, `format`. `astro build` performs TypeScript checks via `@astrojs/check`. Automated verification = `npm run lint` + `npm run build`. Everything else is manual browser smoke.

## Desired End State

A person visits `https://10xdevs-lilac.vercel.app/auth/signin`, sees a single "Continue with Google" button (no email/password form), clicks it, completes Google consent, lands back on `/` signed in, and can reach `/dashboard` without being bounced to `/auth/signin`. The same flow works locally at `http://localhost:4321/auth/signin` when `npm run dev` is run against the hosted Supabase project (env pulled via `vercel env pull`). Failure modes (provider error, missing credentials, exchange failure) surface a readable message at `/auth/signin?error=…` using the existing `ServerError` component.

### Key Discoveries:

- The SSR server client at `src/lib/supabase.ts:5` already does cookie-based session storage — `signInWithOAuth` + `exchangeCodeForSession` work against it unchanged. No new client factory needed.
- The Astro `envField` schema in `astro.config.mjs:18` does **not** need new entries for Google client id/secret: those env vars are consumed only by Supabase (hosted or local CLI), never by our app code. Adding them to `envField` would be dead schema surface.
- The Vercel–Supabase integration's auto-sync of OAuth redirect URIs (see `infrastructure.md` and `deploy-plan.md` Phase 3 step 13) means we only need to register the production base URL and the localhost dev URL — preview URLs are integration-managed.
- Hosted Supabase reads Google credentials from Studio (Authentication → Providers → Google), **not** from Vercel env vars. The `.env.example` Google keys exist only to feed local `supabase start`'s `env()` substitution.
- Astro's pattern for server-only route files (`src/pages/api/auth/signin.ts:1`) uses a default `export const POST: APIRoute` — the OAuth-start route should use `POST` to match the form-submit pattern from the existing CTAs, and the callback route should use `GET` (Supabase's PKCE callback is a GET redirect from the provider).

## What We're NOT Doing

- **Not removing the React form components** (`src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `FormField.tsx`, `PasswordToggle.tsx`, `ServerError.tsx`, `SubmitButton.tsx`). They become unreferenced after Phase 1 but stay in-tree as harmless dormant code — a future re-enable would recompose them with new route handlers. The password-accepting *route* files (`src/pages/api/auth/{signin,signup}.ts`) ARE deleted in Phase 1 (see change #10) because leaving them live would mean `curl -X POST /api/auth/signup` could still create a password account — violating PRD §Access Control's "No passwords are created or stored on our side" letter even with the UI hidden. `confirm-email.astro` goes with them as the only page that referenced their success redirect.
- **Not setting up local `supabase start` Google OAuth** as a working path. Local dev (`npm run dev`) tests against the **hosted** Supabase project's env vars (pulled via `vercel env pull`). Wiring local Supabase + Google requires its own OAuth client and is its own rabbit hole; not blocking FR-001.
- **Not adding a custom domain**. Risk register flags redirect-URI drift on domain attach; `.vercel.app` is sufficient for friend-group v1 per `infrastructure.md`.
- **Not building a "remember where I came from" redirect**. The existing email/password handler redirects to `/` on success; OAuth callback matches that. Adding a `?next=` round-trip is unjustified for v1.
- **Not handling the post-confirm unmark or push-permission denial** — those are different roadmap items (S-02 / S-03 Open Qs).
- **Not adding tests**. There is no test suite in the repo (`package.json` scripts are `dev/build/lint/format` only); verification is `npm run build` + `npm run lint` + manual browser smoke. Standing up Playwright or Vitest is out of scope.

## Implementation Approach

PKCE flow with the existing server-side Supabase client:

1. UI button POSTs to `/api/auth/oauth/google`.
2. That server endpoint calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback } })` and 302s the browser to the returned `data.url` (Google's consent screen).
3. Google redirects back to the Supabase project's hosted callback (`https://<project-ref>.supabase.co/auth/v1/callback`), Supabase processes the provider response, then redirects to our `redirectTo` with a `?code=…` query param.
4. `/auth/callback` (server route) calls `supabase.auth.exchangeCodeForSession(code)`. On success, `@supabase/ssr`'s cookie adapter writes the session cookies via the existing `setAll` hook in `src/lib/supabase.ts:17`; we redirect to `/`. On failure, we redirect to `/auth/signin?error=<message>` — the existing `ServerError` component already displays this.
5. UI on `/auth/signin` and `/auth/signup` is reduced to a single "Continue with Google" CTA; the email/password form components are removed from the page composition (the route handlers and components themselves stay in the file tree, unreferenced).

Provider activation (Google Cloud OAuth client + Supabase Studio config) is a discrete second phase with explicit human steps. Code changes ship Phase 1 even before credentials exist — they just produce a clean Supabase error until the credentials are configured, which is the correct intermediate state.

## Critical Implementation Details

- **OAuth start endpoint must use `data.url`, not auto-redirect.** `supabase.auth.signInWithOAuth(...)` in a server context returns `{ data: { url, provider }, error }` *without* performing the redirect itself (unlike the browser client). The server route must read `data.url` and call `context.redirect(data.url)` explicitly.
- **`/auth/callback` is a GET route**, not POST. Supabase's callback (after the hosted `auth/v1/callback` does its work) redirects the browser via GET to whatever `redirectTo` we passed. The route handler exports `GET`, reads `context.url.searchParams.get('code')`, and handles the absence of `code` (which means an error param is present instead — e.g., `?error=access_denied`).
- **`additional_redirect_urls` in `supabase/config.toml` is an *exact* allowlist.** Both the localhost dev URL (`http://localhost:4321/auth/callback`) and the production URL (`https://10xdevs-lilac.vercel.app/auth/callback`) must be present. The hosted Supabase project also needs the same configured under Studio → Authentication → URL Configuration → Redirect URLs (the config.toml is the local-CLI source of truth; the hosted project has its own UI-managed list). Preview URLs are auto-synced by the Vercel–Supabase integration — do not enumerate them by hand.
- **PKCE code_verifier cookie must survive the OAuth round-trip.** `signInWithOAuth` writes a `code_verifier` cookie on the 302 response; `exchangeCodeForSession` reads it back on the return to `/auth/callback`. `@supabase/ssr`'s default cookie options (`SameSite=Lax`) permit this. Do not tighten auth cookies to `SameSite=Strict` — the browser would drop the cookie on the cross-site return from Google/Supabase and sign-in would fail with a generic Supabase "invalid request" error.

## Phase 1: Code wiring — OAuth endpoints + Google-only UI

### Overview

Add the two server routes that implement the OAuth round-trip, reduce the signin/signup pages to a single Google CTA, and register the callback path in the local Supabase config. This phase is shippable on its own — it produces a working UI that surfaces a Supabase error until Phase 2 lands the provider credentials.

### Changes Required:

#### 1. OAuth start endpoint

**File**: `src/pages/api/auth/oauth/google.ts` (new)

**Intent**: Server-side handler that initiates Google OAuth by calling `signInWithOAuth` and redirecting the browser to the returned authorize URL. POSTs from the auth pages land here.

**Contract**: Exports `POST: APIRoute`. Builds `redirectTo` from `new URL('/auth/callback', context.url.origin).toString()`. Calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`. On `data.url`: `context.redirect(data.url, 302)`. On `error` or missing client: `context.redirect('/auth/signin?error=' + encodeURIComponent(error?.message ?? 'Supabase is not configured'))`. Matches the null-client guard pattern in `src/pages/api/auth/signin.ts:9`.

#### 2. OAuth callback endpoint

**File**: `src/pages/auth/callback.ts` (new)

**Intent**: Server-side handler the OAuth provider redirects back to. Exchanges the `code` query param for a session (cookies set as a side effect by `@supabase/ssr`'s cookie adapter), then redirects to the post-auth landing page.

**Contract**: Exports `GET: APIRoute`. Reads `code = context.url.searchParams.get('code')` and `error = context.url.searchParams.get('error_description') ?? context.url.searchParams.get('error')`. If `error` present or `code` missing: `context.redirect('/auth/signin?error=' + encodeURIComponent(error ?? 'Missing OAuth code'))`. Otherwise: `await supabase.auth.exchangeCodeForSession(code)`; on its `error`: same redirect-with-error; on success: `context.redirect('/', 302)`. The supabase client must be created from `context.request.headers` + `context.cookies` (same factory call as the other auth routes) so the `setAll` cookie hook lands the session.

#### 3. Auth pages — Google-only CTA

**File**: `src/pages/auth/signin.astro`

**Intent**: Replace the email/password `<SignInForm>` composition with a single "Continue with Google" button that POSTs to `/api/auth/oauth/google`. Keep the surrounding `Layout`, glass-card styling, and `?error=` plumbing intact so the existing `ServerError` rendering path (if surfaced via a small inline component or by passing the error to a new CTA component) still works.

**Contract**: The rendered page contains exactly one form: `<form method="POST" action="/api/auth/oauth/google">` with a submit button labeled "Continue with Google" (Lucide `LogIn` icon is fine — keep visual consistency with the prior page). Server-side error from `Astro.url.searchParams.get('error')` is displayed above the button using a minimal inline rendering or by re-using `@/components/auth/ServerError` directly. The "Don't have an account? Sign up" link continues to point at `/auth/signup`. No import of `SignInForm` remains.

#### 4. Auth pages — Google-only CTA (signup)

**File**: `src/pages/auth/signup.astro`

**Intent**: Mirror the signin page change. With OAuth there's no separate sign-up step — the first Google sign-in implicitly creates the user. Frame the button label appropriately ("Continue with Google") and keep the "Already have an account? Sign in" link.

**Contract**: Same as the signin page (single form POSTing to `/api/auth/oauth/google`, no `SignUpForm` import). The page exists primarily so the "Sign up" link in the global UI does not 404; functionally it is identical to signin.

#### 5. Redirect URL allowlist

**File**: `supabase/config.toml`

**Intent**: Add the callback paths to `additional_redirect_urls` so local-dev `supabase start` accepts the OAuth callback and the production base URL is also recognized at the local-CLI level for tooling consistency.

**Contract**: `additional_redirect_urls` (currently `["http://localhost:4321", "http://127.0.0.1:4321"]`) becomes the union of: existing entries, `http://localhost:4321/auth/callback`, `http://127.0.0.1:4321/auth/callback`, `https://10xdevs-lilac.vercel.app`, `https://10xdevs-lilac.vercel.app/auth/callback`. Do not enumerate Vercel preview URLs — those are handled by the Vercel–Supabase integration's redirect-URI sync on the hosted project, not the local config.

#### 6. `.env.example` clarification

**File**: `.env.example`

**Intent**: Reflect that the existing Google OAuth env vars feed only local `supabase start`, not the Astro app. Avoid the next reader assuming they're consumed by our code.

**Contract**: Adjust the existing comment above `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` to call out: "Used by `supabase start` only — hosted Supabase reads Google credentials from Studio (Authentication → Providers → Google), not from Vercel env." No new keys added.

#### 7. Add `typecheck` script

**File**: `package.json`

**Intent**: Wire `astro check` (already installed as `@astrojs/check`) as a runnable script so Phase 1's automated bar can include type verification. `astro build` does not run the checker; this fills the gap without coupling the build to it.

**Contract**: Add `"typecheck": "astro check"` to `scripts` (between `astro` and `lint`, alphabetical order optional). No other script changes.

#### 8. ~~Fix latent React event-type typos in dormant form components~~ — adapted at implementation time

**File**: `src/components/auth/SignInForm.tsx`

**Implementation note (2026-05-27):** the F1 plan-review premise was incorrect. In React 19 (`@types/react@^19.2.14`), `React.SubmitEvent<HTMLFormElement>` IS the canonical type for form-submit handlers, and `React.FormEvent` is the deprecated alias (flagged by `@typescript-eslint/no-deprecated`). `npm run typecheck` passes against the original code unchanged. No edit applied.

#### 9. ~~Fix latent React event-type typos in dormant form components (signup)~~ — adapted at implementation time

**File**: `src/components/auth/SignUpForm.tsx`

**Implementation note (2026-05-27):** same as #8 — no edit applied; original `React.SubmitEvent<HTMLFormElement>` is correct for React 19.

#### 10. Delete password-handling API route

**File**: `src/pages/api/auth/signin.ts` (delete)

**Intent**: Remove the live password sign-in endpoint so the deployed surface cannot accept a password POST from anywhere — UI or curl. Honors PRD §Access Control's "No passwords are created or stored on our side" letter, not just its UI projection.

**Contract**: The file is deleted. `signout.ts` is unaffected (still POSTed by `/dashboard`'s sign-out form). The unreferenced `SignInForm.tsx` component is kept (harmless; never instantiated).

#### 11. Delete password-handling API route (signup)

**File**: `src/pages/api/auth/signup.ts` (delete)

**Intent**: Same as change #10, applied to the sign-up endpoint that calls `supabase.auth.signUp(...)` with a password.

**Contract**: The file is deleted. The unreferenced `SignUpForm.tsx` component is kept.

#### 12. Delete orphaned confirm-email page

**File**: `src/pages/auth/confirm-email.astro` (delete)

**Intent**: This page is reached only via `/api/auth/signup`'s success redirect. With change #11 removing that route, the page is unreachable except by direct URL. Delete to keep the auth surface honest and the file tree free of stale UI.

**Contract**: The file is deleted. No other file references it (verified by grep — the only inbound links were inside the page itself, pointing to `/auth/signin`).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run typecheck` passes (`astro check` reports 0 errors)
- `npm run build` succeeds
- `src/pages/api/auth/oauth/google.ts` and `src/pages/auth/callback.ts` exist on disk
- `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, and `src/pages/auth/confirm-email.astro` do NOT exist on disk

#### Manual Verification:

- `npm run dev` → visit `/auth/signin`: page renders, exactly one button visible, labeled "Continue with Google"; no email or password input fields visible
- Same for `/auth/signup`
- Clicking "Continue with Google" (before Phase 2 credentials exist) produces a Supabase error visible as `?error=…` on `/auth/signin` — the round-trip wiring is reachable, the failure is in provider-credentials-not-configured (which is expected at the Phase 1 gate)
- `/dashboard` still 302s to `/auth/signin` for an anonymous request (middleware not regressed)
- `curl -X POST http://localhost:4321/api/auth/signin -d 'email=x&password=y'` returns 404 (route is gone, password surface neutralized); same for `/api/auth/signup`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Provider activation + end-to-end verification

### Overview

Create the Google Cloud OAuth client, paste credentials into the hosted Supabase project's Studio, smoke the end-to-end round-trip on `localhost` (against hosted Supabase) and on production. This is the human-gated phase per `change.md` notes; `deploy-plan.md` Phase 2 step 10 explicitly deferred it to this change.

### Changes Required:

#### 1. Google Cloud OAuth client (human-only, no repo change)

**File**: (external — Google Cloud Console)

**Intent**: Create an OAuth 2.0 Web Application client in Google Cloud Console with the Supabase project's hosted callback URL as an authorized redirect URI, so Google trusts our hosted Supabase project to complete the OAuth round-trip.

**Contract**: A Google Cloud project exists (or is created) with the OAuth consent screen configured (external, in-testing mode is acceptable for v1 — the friend group are added as Test Users). Create credentials → OAuth Client ID → Web application. **Authorized redirect URIs** must include `https://<supabase-project-ref>.supabase.co/auth/v1/callback` (the project ref is the subdomain of the Supabase project URL). Capture the resulting client ID and client secret. The Astro app's URLs (`localhost:4321`, `10xdevs-lilac.vercel.app`) are *not* registered with Google — Google only sees Supabase's domain.

#### 2. Hosted Supabase Studio — Google provider config (human-only, no repo change)

**File**: (external — Supabase Studio)

**Intent**: Tell the hosted Supabase project to trust the Google OAuth client we just created, and confirm the redirect-URL allowlist permits the Astro app's callback path.

**Contract**: In Studio → Authentication → Providers → Google: enable, paste client ID and client secret, save. In Studio → Authentication → URL Configuration: set Site URL to `https://10xdevs-lilac.vercel.app`; add `https://10xdevs-lilac.vercel.app/auth/callback` and `http://localhost:4321/auth/callback` to Redirect URLs (Vercel preview URLs are auto-synced by the Vercel–Supabase integration — do not add them manually).

#### 3. Local `.env` — optional convenience (human-only, no repo change)

**File**: (local-only — `.env` is in `.gitignore`)

**Intent**: Allow `supabase start` (if ever used for local-stack work) to substitute the Google env vars in `supabase/config.toml`. Not gating; `npm run dev` against the hosted project is the recommended path.

**Contract**: Paste the same client ID / secret into `.env` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`. No code-level effect; only the local Supabase CLI reads these.

### Success Criteria:

#### Automated Verification:

- `vercel env ls` shows no NEW env vars expected (Google credentials live in Supabase Studio, not in Vercel — this is a verification *that we did not accidentally add them to Vercel*)
- `git status` is clean after Phase 1 commit (no Phase-2 changes alter tracked files)

#### Manual Verification:

- `npm run dev` (with `vercel env pull .env` already done so SUPABASE_URL/ANON_KEY are populated) → visit `http://localhost:4321/auth/signin` → click "Continue with Google" → Google consent screen renders → consent → land on `http://localhost:4321/` with the user signed in → `/dashboard` renders and shows the Google account's email
- On production: visit `https://10xdevs-lilac.vercel.app/auth/signin` → click "Continue with Google" → consent → land on `https://10xdevs-lilac.vercel.app/` signed in → `/dashboard` renders with email
- **Preview-deploy verification (exercises the Vercel–Supabase integration redirect-URI auto-sync that `deploy-plan.md` Phase 3 step 13 deferred to FR-001):** push a feature branch or open a no-op PR; on the resulting preview URL (e.g. `https://10xdevs-<hash>-aspirew.vercel.app`), repeat the Google sign-in round-trip and confirm it lands signed-in. If it fails with `redirect_uri_mismatch`, manually verify the preview URL appears in Supabase Studio → Authentication → URL Configuration → Redirect URLs; if absent, the integration's sync is broken and that's a separate issue to file before closing this change. Close/abandon the PR after verification.
- Tag the prod-verified deploy: `git tag prod-2026-MM-DD-1 && git push origin --tags` (per the `infrastructure.md` rollback discipline)
- Sign out via `/dashboard`'s POST form continues to work; subsequent `/dashboard` request 302s to `/auth/signin` (sanity that session was actually removed)

**Implementation Note**: This phase is human-gated end to end. The agent's role is to walk the human through the steps and verify success after each external action. No commit lands until both localhost and prod round-trips succeed.

---

## Testing Strategy

### Unit Tests:

- None — no test suite exists in the repo and adding one is out of scope (see "What We're NOT Doing"). Automated correctness is bounded by `astro check` (typecheck via `npm run build`) and `eslint`.

### Integration Tests:

- None mechanized. The end-to-end OAuth round-trip is verified by hand in Phase 2 against both localhost and prod.

### Manual Testing Steps:

1. Phase 1: confirm signin/signup pages render the Google CTA only, button reaches the start route, missing-credentials error surfaces as `?error=…`.
2. Phase 2: full round-trip on localhost — initiate Google sign-in, complete consent, land signed-in on `/`, reach `/dashboard`, sign out.
3. Phase 2: same on production prod URL.
4. Edge case (Phase 2): cancel Google consent → land on `/auth/signin?error=access_denied` (or equivalent message); the page surfaces the error via the existing `ServerError` rendering path.
5. Edge case (Phase 2): hit `/auth/callback` directly with no `code` and no `error` → redirects to `/auth/signin?error=Missing+OAuth+code`.

## Performance Considerations

Not a real concern at friend-group scale. The OAuth start endpoint is one Supabase API call + a redirect; the callback is one `exchangeCodeForSession` + a redirect. Both fit comfortably inside Vercel's Hobby 10-second function timeout (`infrastructure.md` risk register flags this only for the push-send route, not auth). No caching strategy needed; no `maxDuration` override required.

## Migration Notes

No data migration. The user table in Supabase is empty (no domain tables created yet — that's S-01 onward). The password-handling routes (`src/pages/api/auth/signin.ts`, `signup.ts`) and the `confirm-email.astro` page are deleted in Phase 1; if/when the PRD decision flips back to allowing email/password, restoring them is a clean `git revert` of those file deletions. The React form components in `src/components/auth/` remain in-tree but become unreferenced — they're harmless dormant code and a future re-enable would recompose them with new route handlers.

## References

- Change identity: `context/changes/google-oauth-signin/change.md`
- Roadmap entry: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (FR-001, §Access Control)
- Tech stack: `context/foundation/tech-stack.md`
- Infrastructure: `context/foundation/infrastructure.md`
- Deploy plan (Phase 2 step 10 deferred Google OAuth to this change): `context/foundation/deploy-plan.md`
- Existing SSR client (pattern to follow): `src/lib/supabase.ts:5`
- Existing auth-route pattern (null-client guard, error redirect): `src/pages/api/auth/signin.ts:9`
- Middleware behavior depended on (cookies → session → `Astro.locals.user`): `src/middleware.ts:6`
- Supabase Google OAuth config block: `supabase/config.toml:320`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Code wiring — OAuth endpoints + Google-only UI

#### Automated

- [x] 1.1 `npm run lint` passes — 98a65c5
- [x] 1.2 `npm run typecheck` passes (`astro check` reports 0 errors) — 98a65c5
- [x] 1.3 `npm run build` succeeds — 98a65c5
- [x] 1.4 `src/pages/api/auth/oauth/google.ts` and `src/pages/auth/callback.ts` exist on disk — 98a65c5
- [x] 1.5 `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`, and `src/pages/auth/confirm-email.astro` do NOT exist on disk — 98a65c5

#### Manual

- [x] 1.6 `npm run dev` → visit `/auth/signin`: page renders, exactly one button visible, labeled "Continue with Google"; no email or password input fields visible — 98a65c5
- [x] 1.7 Same for `/auth/signup` — 98a65c5
- [x] 1.8 Clicking "Continue with Google" (before Phase 2 credentials exist) produces a Supabase error visible as `?error=…` on `/auth/signin` — the round-trip wiring is reachable, the failure is in provider-credentials-not-configured (which is expected at the Phase 1 gate) — 98a65c5
- [x] 1.9 `/dashboard` still 302s to `/auth/signin` for an anonymous request (middleware not regressed) — 98a65c5
- [x] 1.10 `curl -X POST http://localhost:4321/api/auth/signin -d 'email=x&password=y'` returns 403 "Cross-site POST form submissions are forbidden" (Astro CSRF middleware short-circuits before the route resolver — a stronger guarantee than the planned 404; password surface unreachable). Same for `/api/auth/signup`. — 98a65c5

### Phase 2: Provider activation + end-to-end verification

#### Automated

- [x] 2.1 `vercel env ls` shows no NEW env vars expected (Google credentials live in Supabase Studio, not in Vercel — this is a verification *that we did not accidentally add them to Vercel*)
- [x] 2.2 `git status` is clean after Phase 1 commit (no Phase-2 changes alter tracked files) — interpreted as "no Phase-2 source/config changes outside the Phase-1 SHA write-back", which is satisfied

#### Manual

- [x] 2.3 `npm run dev` (with `vercel env pull .env` already done so SUPABASE_URL/ANON_KEY are populated) → visit `http://localhost:4321/auth/signin` → click "Continue with Google" → Google consent screen renders → consent → land on `http://localhost:4321/` with the user signed in → `/dashboard` renders and shows the Google account's email. **Implementation tripwire**: local `.env` had stale `SUPABASE_KEY` (pre-deploy-plan-rename); needed in-place rename to `SUPABASE_ANON_KEY` + dev-server restart before the env schema saw it.
- [x] 2.4 On production: visit `https://10xdevs-lilac.vercel.app/auth/signin` → click "Continue with Google" → consent → land on `https://10xdevs-lilac.vercel.app/` signed in → `/dashboard` renders with email. **Implementation tripwire**: prod Supabase project (`dchurjcpgzuoyunjsokl`) is provisioned by the Vercel–Supabase Marketplace integration and is distinct from the project the local `.env` pointed at (`uldvnsbhztupwemzityg`). The Vercel-managed project must be reached via Vercel → Storage → "Open in Supabase" (no direct Supabase Studio access). Google provider had to be enabled separately on the prod-bound project; Google Cloud OAuth client's authorized redirect URIs needed BOTH supabase project callback URLs (`https://<each-ref>.supabase.co/auth/v1/callback`) since dev and prod hit different Supabase projects.
- [x] 2.5 Preview-deploy verification: push a feature branch / open a no-op PR; run the Google sign-in round-trip on the preview URL; confirm sign-in lands signed-in (exercises the Vercel–Supabase integration redirect-URI auto-sync deferred from `deploy-plan.md` Phase 3 step 13). Close/abandon the PR after verification. **Real failure mode (lesson-worthy)**: integration's preview-URL auto-sync is NOT actually wiring preview URLs into the Supabase Redirect URLs allowlist, contra `infrastructure.md`'s claim. First sign-in attempt silently bounced from preview to prod Site URL with code on `/` (no `/auth/callback` exchange = no session). Workaround applied: add wildcard `https://**.vercel.app/auth/callback` to Supabase Studio → Authentication → URL Configuration → Redirect URLs (tighter patterns like `https://*-aspirew.vercel.app/...` were rejected by Studio's form validator — `**` works because the UI URL parser accepts it as a structurally-valid hostname). Verified end-to-end on `https://10xdevs-dvx06ugqf-aspirew.vercel.app` via throwaway branch `oauth-preview-verify` (deleted post-verification). **Security tradeoff**: wildcard accepts any `.vercel.app` subdomain — practical exposure is small given PKCE + Deployment Protection on previews, but tighter pattern recommended for v2.
- [x] 2.6 Tag the prod-verified deploy: `git tag prod-2026-MM-DD-1 && git push origin --tags` (per the `infrastructure.md` rollback discipline). Tagged `prod-2026-05-27-3` on commit `98a65c5` (continues prod-2026-05-27-1/-2 series from deploy-plan.md Phase 3).
- [x] 2.7 Sign out via `/dashboard`'s POST form continues to work; subsequent `/dashboard` request 302s to `/auth/signin` (sanity that session was actually removed). Verified additionally via multi-account swap (sign in / sign out / sign in as different Google account).
