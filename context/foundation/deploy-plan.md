---
project: game-slot
authored_at: 2026-05-25
source: context/foundation/infrastructure.md
scope: vercel-integration + first-prod-deploy
out_of_scope: pwa, web-push, custom-domain, vercel-mcp
status: not-started
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

4. Install Vercel CLI: `npm i -g vercel` (local-machine action).
5. `vercel link` interactively → creates `game-slot` project, writes `.vercel/project.json`.
6. Confirm pinned versions are the known-green pair (`astro@6.3.1`, `@astrojs/vercel@10.0.7`); add a one-line note in `AGENTS.md` deferring `npm update` per risk register row 3.

**Gate:** `.vercel/project.json` exists; `vercel whoami` succeeds.

## Phase 2 — Supabase ↔ Vercel wiring *(FR-001 auth path)*

7. Install Supabase Vercel integration via Vercel dashboard (Marketplace → Supabase → Connect). Auto-syncs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and registers the redirect-URI webhook.
8. Reconcile env-var names: `.env.example` and `astro.config.mjs` `envField` schema currently use `SUPABASE_KEY`; the integration writes `SUPABASE_ANON_KEY`. Rename locally to match the integration's canonical names so prod and local agree. Update `ci.yml` secrets in the same pass.
9. Add `[auth.external.google]` block to `supabase/config.toml` (enabled, `client_id`/`secret` via `env()`).
10. Create Google Cloud OAuth client; paste credentials into Supabase Studio → Authentication → Providers → Google; add the Supabase callback URL to the Google client's allowed redirect list.

**Gate:** `supabase start` locally; sign-in flow completes against the new Google provider.

## Phase 3 — First production deploy

11. `vercel --prod` → returns prod URL.
12. Smoke test on prod: Google sign-in round-trip works.
13. Open a throwaway PR; smoke test on its preview URL — this validates the redirect-URI auto-sync (the single risk that made Vercel the recommendation over Cloudflare).
14. Tag the deploy: `git tag prod-2026-05-25-1 && git push --tags` — mitigates Hobby's one-step rollback ceiling.

**Gate:** prod URL serves the app; auth works on prod **and** on a preview.

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
