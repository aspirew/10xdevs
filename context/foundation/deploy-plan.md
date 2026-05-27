---
project: game-slot
authored_at: 2026-05-25
source: context/foundation/infrastructure.md
scope: vercel-integration + first-prod-deploy
out_of_scope: pwa, web-push, custom-domain, vercel-mcp
status: phase-3-complete
---

## Purpose

Operationalize `context/foundation/infrastructure.md` into a sequenced, auditable plan that turns the current repo state into a working Vercel deployment with Supabase Google OAuth (FR-001). PWA + Web Push (`@vite-pwa/astro`, `web-push`, VAPID) are intentionally deferred to FR-012's change folder — this plan covers infra only.

## Current state (audited 2026-05-25)

- Adapter swapped to `@astrojs/vercel@10.0.7` in `package.json` + `astro.config.mjs` (uncommitted).
- `wrangler.jsonc` deleted (uncommitted).
- Supabase SDK + SSR installed (`@supabase/ssr`, `@supabase/supabase-js`).
- Vercel CLI not on PATH; project not linked (no `.vercel/`).
- Supabase Vercel integration not installed.
- Supabase Google OAuth not configured — `supabase/config.toml` has only `[auth]` defaults, no `[auth.external.google]`.
- Side-finding: `.github/workflows/ci.yml` triggers on `master`, but the git default branch is `main` — CI is dormant on actual pushes.

## Phase 0 — Land the existing bootstrap delta

1. Commit current uncommitted Vercel-swap diff as one commit: `astro.config.mjs`, `package.json`, `package-lock.json`, `wrangler.jsonc` deletion, `context/changes/bootstrap-verification/verification.md` update.
2. Fix `.github/workflows/ci.yml` triggers `master` → `main`.
3. Confirm `.vercel/` is in `.gitignore` (add if missing).

**Gate:** clean `git status`; CI runs and passes on `main`.

## Phase 1 — Vercel platform link *(no app changes)*

4. Install Vercel CLI: `npm i -g vercel` (local-machine action). ✅
5. `vercel link` interactively → writes `.vercel/repo.json` (newer CLI schema; supersedes `project.json`). Actual linked project: `aspirew/10xdevs` (not `game-slot` — accepted Vercel's directory-default name; rename is cosmetic, deferred). GitHub repo `aspirew/10xdevs` auto-connected. ✅
6. Pin `astro@6.3.1` and `@astrojs/vercel@10.0.7` exactly in `package.json` (drop `^`) — narrow scope of risk-register row 3 (esbuild bug in [withastro/astro#16258](https://github.com/withastro/astro/issues/16258)). Node runtime alignment: standardize on **Node 24** (current LTS as of 2026-05; Vercel default; adapter-canonical runtime). Updated `.nvmrc` (22.14.0 → 24) and `.github/workflows/ci.yml` (node-version: 22 → 24). One-line `AGENTS.md` note deferred to Phase 4 step 15 to avoid duplication. ✅

**Gate:** `.vercel/repo.json` exists; `vercel whoami` succeeds; `npm run build` produces `.vercel/output/`.

**Deferred to Phase 3** (will only matter at deploy time):
- Vercel "Framework Preset" reads as "Other" rather than "Astro" — functionally fine because the adapter emits Build Output API artifacts, but revisit if first prod deploy misbehaves (fix = add `vercel.json` with `"framework": "astro"`).
- `[@astrojs/sitemap] requires the 'site' option` warning — fix in `astro.config.mjs` after Phase 3 returns the prod URL.

## Phase 2 — Supabase ↔ Vercel wiring *(FR-001 auth path)*

7. ✅ Supabase Vercel integration installed and resource attached to the `10xdevs` project (via Storage tab → Connect Store, after team-level Marketplace install didn't auto-bind the per-project resource — recorded as Phase 2 tripwire below). Integration writes `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` plus extras (POSTGRES_*, JWT_SECRET, 2025-vintage `SUPABASE_SECRET_KEY`/`PUBLISHABLE_KEY`) to Production + Preview scopes; Development scope intentionally empty (local dev uses `supabase start`).
8. ✅ Reconciled env-var names: renamed `SUPABASE_KEY` → `SUPABASE_ANON_KEY` and added `SUPABASE_SERVICE_ROLE_KEY` across `.env.example`, `astro.config.mjs` envField schema, `.github/workflows/ci.yml` secret refs, and starter code (`src/lib/supabase.ts`, `src/lib/config-status.ts`). Build verified green.
9. ✅ Added `[auth.external.google]` block to `supabase/config.toml` (enabled, `client_id`/`secret` via `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID/SECRET)`, `skip_nonce_check = true` for local-dev Google auth). Also corrected `site_url` and `additional_redirect_urls` from `127.0.0.1:3000` to `localhost:4321` to match Astro 6's default dev port (was a silent breakage waiting at the Phase 2 gate).
10. ⏸️ **Deferred to FR-001.** Google Cloud OAuth client creation + paste credentials into Vercel env (`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`/`_SECRET`), local `.env`, and hosted Supabase Studio (Authentication → Providers → Google). Reason: the starter ships email/password auth only — there is no `signInWithOAuth` call or OAuth callback handler in `src/pages/api/auth/` yet, so Google credentials cannot be exercised end-to-end at this phase. FR-001 implementation will pair the credentials with the frontend wiring that consumes them.

**Gate (revised):** env vars present in Vercel for Production + Preview; `[auth.external.google]` ready for `env()` substitution; `npm run build` green. End-to-end Google sign-in test moves to FR-001's verification.

**Phase 2 tripwire (for AGENTS.md / future projects):** The Supabase Vercel integration has a two-step install — adding it from the Vercel Marketplace authorizes Supabase at the **team scope** but does NOT auto-bind a Supabase project to a specific Vercel project. The project-level resource attachment happens in the Vercel project's **Storage** tab → "Connect Store" → Supabase → pick existing project. If `vercel env ls` shows no env vars after the Marketplace install, the second step was missed.

## Phase 3 — First production deploy

11. ✅ `vercel --prod` → returned prod URL. Deployment `dpl_C5ijbXZ72k1XocWYPiQDQGLTShQk` at `https://10xdevs-piq3f93d5-aspirew.vercel.app`, aliased to `https://10xdevs-lilac.vercel.app`. Built on Vercel in 24s.
12. ✅ **Smoke test scope revised to match Phase 2 step 10 deferral:** Google sign-in round-trip moves to FR-001 (no `signInWithOAuth` call ships in the starter). What was verified on prod instead: `/` → 200, `/auth/signin` → 200, `/dashboard` → 302 → `/auth/signin` (proves auth middleware + Supabase client are wired at runtime against hosted env vars). Manual email/password browser round-trip can be exercised at any time; not gated on this phase.
13. ✅ Opened throwaway PR #1 (`chore/sitemap-site-url`) — addressed the Phase 1 deferred `site` option so the validation PR also clears the `[@astrojs/sitemap] requires the 'site' option` warning. Preview built and Ready in 22s (`https://10xdevs-ceef9bapl-aspirew.vercel.app`). Preview returns 401 to anonymous curl because Vercel **Deployment Protection** gates preview URLs behind Vercel login by default — that's the expected state, not a failure. Squash-merged after smoke. **Redirect-URI auto-sync for preview-scoped OAuth callbacks is not exercised yet** — that validation moves to FR-001 with the rest of OAuth wiring.
14. ✅ Tagged two rollback targets: `prod-2026-05-27-1` at commit `839c8c3` (first CLI-driven prod deploy) and `prod-2026-05-27-2` at commit `0fdcd6f` (post-merge prod with sitemap-index.xml live). Both pushed.

**Gate (revised):** prod URL serves the app **and** auth middleware behaves correctly under anonymous requests (verified by 302). End-to-end OAuth verification across prod + preview moves to FR-001.

**Phase 3 tripwires (for future projects):**
- Vercel preview URLs are gated by Deployment Protection by default; expect 401 on anonymous `curl`. Smoke-testing previews from a script requires either disabling protection or passing a bypass token (`vercel-protection-bypass` header). Visual verification in a logged-in browser is the simplest path.
- A `vercel --prod` from local + a later `git push origin main` of the same code produces two prod deploys (one CLI-driven, one GitHub-driven). They're functionally identical but each counts against build minutes. To avoid: push to GitHub first and let the integration deploy, OR keep doing CLI-driven prods and accept the extra GitHub auto-deploy on the next push.

## Phase 4 — Document tripwires *(paper trail only)*

15. Append a "Deployment tripwires" section to `AGENTS.md` covering:
    - Do not attach a custom domain without re-verifying Supabase redirect URIs.
    - Do not run `npm update`; pin Astro + adapter (link to [withastro/astro#16258](https://github.com/withastro/astro/issues/16258)).
    - Hobby invocation budget is shared per account; do not run unrelated projects under the same Vercel account.
    - Schema-additive Supabase migrations before code deploy; schema-removing only after the new code has run ≥24h (rollback rolls back code, not Supabase).

## Out of scope (deferred)

- `@vite-pwa/astro` + `web-push` + VAPID — picked up in FR-012 change folder.
- `export const maxDuration = 60` on push routes — picked up alongside the push-send route's creation.
- Custom domain — `.vercel.app` is sufficient for v1.
- Vercel MCP — optional accessory; not a deploy dependency.

## Risk-register coverage

Each phase maps to mitigations in `infrastructure.md`'s risk register:

| Phase | Mitigates |
|---|---|
| 0 | Adapter/wrangler residue (row 13) |
| 1 | Pinned versions for Astro+adapter bug (row 3); MCP-not-required posture (row 10) |
| 2 | Custom-domain redirect-URI drift (row 7); env-var-rename pitfall (unknown unknown) |
| 3 | One-step rollback restriction (row 2) |
| 4 | Commercial-use ToS (row 1); custom-domain drift (row 7); shared invocation budget (rows 5, 8); migration ordering (operational story) |

## Approval split (verbatim from infrastructure.md operational story)

- **Agent may run unattended:** `vercel`, `vercel --prod`, `vercel logs`, `vercel env pull`, `vercel rollback`.
- **Human-only:** `vercel teams switch`, billing changes, env var *creation* for new secrets, custom domain attach/detach, Supabase project deletion or migration squashes, Supabase Vercel integration install (dashboard), Google OAuth client creation (Google Cloud console).
