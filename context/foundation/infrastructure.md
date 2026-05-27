---
project: game-slot
researched_at: 2026-05-25
recommended_platform: vercel
runner_up: cloudflare-workers
context_type: mvp
tech_stack:
  language: javascript
  framework: astro-6
  runtime: node-22
  database: supabase-postgres
---

## Recommendation

**Deploy on Vercel (Hobby plan, Node.js runtime).**

Vercel is the lowest-friction path to ship GameSlot inside the 3-week MVP window with `@astrojs/vercel@10` + Supabase Auth (Google OAuth via `@supabase/ssr`) + `@vite-pwa/astro` + Web Push (VAPID). The user's cost-minimization signal made Cloudflare Workers the top-of-table candidate (true $0/mo with hard-cap, no commercial-use clause, best agent-friendly score), but the anti-bias cross-check surfaced one open blocker — `supabase/ssr#56` (Google OAuth cookie overflow at the edge) is unresolved upstream as of 2026-05-25 — that was judged too risky to absorb during a 3-week launch with FR-001's Google SSO on the critical path. Vercel's Hobby free tier is hard-capped (no surprise bills), the Supabase Vercel integration auto-syncs OAuth redirect URIs across preview deploys (eliminating the largest source of SSR-auth pain), and the platform's mature toolchain compensates for the broader ToS termination risk (mitigated structurally in the risk register).

> **Verified (FR-001, 2026-05-27)**: the integration's preview redirect-URI auto-sync did NOT work as documented — preview deploys silently fell back to Site URL with the OAuth code landing on `/` instead of `/auth/callback`. Durable workaround: add wildcard `https://**.vercel.app/auth/callback` to Supabase's Redirect URLs allowlist (Studio → Authentication → URL Configuration). The "differentiator" framing above is preserved as the planning rationale at the time but should not be relied on by future changes without re-verification. See `context/foundation/lessons.md` → "Verify integration auto-sync claims empirically before treating them as load-bearing".

## Platform Comparison

Six platforms researched in parallel, scored Pass / Partial / Fail on the five agent-friendly criteria. Soft weights derived from the developer interview: cost-minimize (Q2), no existing platform familiarity (Q3), single-region (Q4), external managed services (Q5). Hard filter from Q1 (no persistent connections required) dropped no platforms.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / integration | Raw |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** (runner-up) | Pass | Pass | **Pass+** (llms.txt + per-product) | Pass | Pass (docs MCP GA) | 5/5 |
| **Vercel** (recommended) | Pass | Pass | Pass | Pass (Hobby rollback restricted to immediate-previous) | Partial (MCP public beta) | 4.5/5 |
| **Netlify** | Pass | Pass | Pass | Pass (`netlify logs` GA 2026-05-01) | Pass (@netlify/mcp GA) | 5/5 |
| Render | Pass | Pass | Pass | Pass | Pass (MCP GA) | 5/5 |
| Fly.io | Pass | Partial (Astro Dockerfile auto-gen still broken) | Pass | Pass | Partial (`fly mcp` experimental) | 4/5 |
| Railway | Pass | Pass | Pass | Partial (no rollback CLI) | Partial (MCP "work in progress") | 4/5 |

### Shortlisted Platforms

#### 1. Vercel (Recommended)

`@astrojs/vercel@10.x` (current npm `10.0.7`) is the canonical Astro 6 SSR adapter; `output: 'server'` + `adapter: vercel()` is the default install. The Supabase Vercel integration is the differentiator for this stack — preview-deploy auth redirect URIs are kept in sync automatically by deploy webhook, which is the single largest source of SSR-auth pain on every other platform researched. Hobby plan: 100 GB Fast Data Transfer, 1M Function Invocations, 4 CPU-hours Active CPU, 360 GB-hr memory, 100 deploys/day, 10s default function timeout (Hobby max 60s via `export const maxDuration = 60`), hard-cap on overage (service pauses until the 30-day window resets — no surprise bills). Vercel MCP is public beta (since Feb 2026) — `claude mcp add --transport http vercel https://mcp.vercel.com`; until GA, treat as a useful but not load-bearing accessory.

#### 2. Cloudflare Workers (Runner-up)

Tied for the highest raw score (5/5) and the strongest economics — Workers Free is 100k requests/day with hard-stop (no overage bill), no commercial-use restriction, Class A KV ops billed separately if used. `@astrojs/cloudflare@13.5.0` is already installed in the repo (no adapter swap needed) and Workers Static Assets has replaced Pages as the recommended path since late 2025. **Why it's runner-up and not recommended for this stack:** `supabase/ssr#56` (Google OAuth's 4-cookie pattern overflowing Cloudflare's request-header limit) is **still open** with no upstream fix as of 2026-05-25. The workaround is a hand-rolled `CookieStorage` adapter that chunks auth state across more cookies — bespoke security-sensitive code that's the wrong shape for a 3-week launch with FR-001 on the critical path. Becomes the recommendation in v2 once `#56` resolves OR once GameSlot has shipped and the user has cycles for a deliberate cookie-chunking implementation.

#### 3. Netlify

Solid middle ground. `@astrojs/netlify@7` maps Astro SSR routes to Node Functions and middleware to Edge Functions. `netlify logs` CLI hit GA on 2026-05-01. `@netlify/mcp` is production-listed (9 tools, Node 22+, no beta flag). Credit-based free tier (300 credits/mo, ~1.5M SSR requests of headroom before bandwidth/compute caps bite, hard-cap on overage). **Why it's third:** the Supabase + Netlify integration does NOT auto-register preview-deploy redirect URIs with Google OAuth — Google's OAuth client requires exact URIs (no wildcards), so every preview branch's callback would need manual registration. Manageable for a single-branch friend-group app but materially more tedious than Vercel's auto-sync.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **Hobby ToS §4 commercial-use clause is the central termination switch.** Defined as *"You shall only use the Services under a Hobby plan for your personal or non-commercial use."* Enforced at sole discretion ("with or without notice"). GameSlot fits the personal-use carve-out today; the risk is interpretation drift if the user later runs paid client work under the same Vercel account.
2. **Hobby rollback is restricted to the immediately-previous production deployment.** Two-deploys-deep bugs require either rebuild-from-known-good-commit or upgrade to Pro ($20/mo) for full rollback history.
3. **Live Astro 6 + `@astrojs/vercel@10.0.4` esbuild bug ([withastro/astro#16258](https://github.com/withastro/astro/issues/16258)).** Parse error on generated script chunks. Pin to a working pair; track the issue before going to production.
4. **`astro preview` is still unsupported by `@astrojs/vercel` in 2026.** Production-build preview requires `vercel dev` (needs `vercel link` + env-var pull) or temporary adapter swap to `@astrojs/node`. Small but recurring friction during the 3-week MVP.
5. **Function invocations are per-page-load on SSR.** PWA background-sync misconfig can silently burn the 1M/mo Hobby budget. Hard-cap means the app *stops working* until the 30-day window resets — there's no overage option on Hobby.
6. **PWA service-worker scope can collide with Vercel's edge-cached HTML.** Aggressive HTML pre-cache via `@vite-pwa/astro` can serve stale auth-bound pages to newly-signed-in users until the SW cache invalidates. Mitigation: `NetworkFirst` strategy for HTML, explicit cache-control on authed routes.
7. **Web Push from the Node runtime defaults to a 10s function timeout** (Hobby cap is 60s via `maxDuration`). Pushing to ~10 group members fits comfortably; slow push endpoints can exceed 10s if `maxDuration` isn't set explicitly.

### Pre-Mortem — How This Could Fail

It's 2026-12. GameSlot launched on Vercel Hobby in week 3 of the MVP. The first month was smooth — Supabase Auth previews resolved cleanly via the Vercel-Supabase integration, push notifications fired on every session confirm, the friend group used GameSlot weekly. In month two the host built a small portfolio site for a freelance client who paid him a flat fee and deployed it under the same Vercel account. Three weeks later, Vercel's automated commercial-use scan flagged the account; both projects were suspended pending review. GameSlot went dark for 9 days while the host argued the ToS interpretation. By the time the freelance project was migrated to a separate Vercel team and GameSlot was restored, the friend group had lost the habit and stopped marking availability. Compounding it: the PWA service worker had pre-cached the pre-suspension HTML, serving stale "service down" pages to repeat visitors for a full week after restoration — the group thought the app was permanently dead.

### Unknown Unknowns

- **Custom-domain drift breaks Supabase redirect URI sync.** The Vercel-Supabase integration syncs at install + on deploy webhooks; a manually-added custom domain mid-flight does NOT auto-update the redirect URI list. The integration UI does not surface this clearly.
- **`@astrojs/vercel@10` was published recently** (current npm `10.0.7` as of 2026-05-25). v8/v9-era tutorials describe different middleware and image-optimization behavior. Trust only `docs.astro.build/en/guides/integrations-guide/vercel/` — not blog posts from 2024.
- **Hobby invocation budget is shared per account, not per project.** A runaway preview build on any project under the account chews the budget for *all* projects under it.
- **Hobby teams cannot have additional members.** If a friend wants to help maintain GameSlot later, that forces a Pro upgrade ($20/mo) or shared credentials (bad security posture).
- **Vercel Edge runtime is GA but the platform officially recommends migrating to Node.js.** 2023–2024 Astro+Edge tutorials are operating against the platform's stated direction; the recommendation here is the **Node runtime explicitly**.
- **The repo currently has `@astrojs/cloudflare@13.5.0` installed** (despite the prior tech-stack.md naming Vercel). Adapter swap, `wrangler.jsonc` cleanup, and `@vite-pwa/astro` install are pending — the prior commit message "swap to vercel deployment; add PWA NFR" was misleading. These steps are itemized in `## Getting Started`.

## Operational Story

How Vercel actually operates day-to-day for GameSlot.

- **Preview deploys**: every push to a non-default branch and every PR triggers an auto-deploy at `<project>-<branch-hash>-<scope>.vercel.app`. Supabase integration writes preview-specific redirect URIs back to the Supabase project via webhook so OAuth callbacks resolve on the preview URL. Previews are public by default — for a personal friend-group app this is acceptable; if invite-link confidentiality matters more (PRD's `## Open Questions` item 1), gate previews via Vercel Password Protection (paid feature) or rely on the Supabase Auth flow itself to block unauthorized access. Fork PRs deploy without secret access (no env vars exposed) — safe by default.
- **Secrets**: env vars live in Vercel's project settings, scoped per environment (Production / Preview / Development). Supabase integration syncs `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. VAPID push keys (`VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`) are added manually via `vercel env add` or the dashboard. Rotation: `vercel env rm <name>` + re-add + redeploy. Read access: project owner only on Hobby (no additional team members).
- **Rollback**: `vercel rollback <deployment-url>` returns to a previous deployment in seconds (zero-downtime). **Hobby restriction**: only the immediately-previous production deployment is rollback-able from CLI; older deploys require git-revert + redeploy or Pro upgrade for full history. **Data caveat**: rollback rolls back code only — Supabase schema migrations are independent and do not roll back. Migration ordering: apply schema-additive changes (new columns/tables) before code deploy; defer schema-removing changes until after the new code has bedded in for ≥24h.
- **Approval**: agent may perform unattended: `vercel`, `vercel --prod`, `vercel logs`, `vercel env pull`, `vercel rollback`. Human-only: `vercel teams switch`, billing changes, env var *creation* for new secrets (the user pastes the secret value into the terminal — the agent reads it from the env, not from chat), custom domain attach/detach, Supabase project deletion or migration squashes.
- **Logs**: `vercel logs <deployment-url> --follow` for live tail; `vercel logs <deployment-url>` for recent. Build logs land in the dashboard and via the same CLI. Vercel MCP (public beta) exposes structured log queries — useful when the agent needs to read logs as part of a debugging loop without copy-pasting CLI output.

## Risk Register

Every row names the lens that surfaced it. Likelihood and Impact are L/M/H. Mitigations are concrete actions, not categories.

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Vercel Hobby ToS commercial-use clause triggered if user later deploys paid work under same account | Devil's advocate / Pre-mortem | M | H | Keep GameSlot in a **separate Vercel team** from any future commercial work; never accept payment for GameSlot itself; if monetization is ever considered, plan upgrade to Pro pre-emptively. Re-read fair-use guidelines quarterly. |
| Hobby rollback restricted to the immediately-previous production deployment | Devil's advocate | L | M | Tag every prod deploy in git (`git tag prod-YYYY-MM-DD-N`); if a >1-deploy bug ships, redeploy from a known-good tag rather than relying on `vercel rollback`. |
| `@astrojs/vercel@10.0.4` + Astro 6.1.4 esbuild bug ([withastro/astro#16258](https://github.com/withastro/astro/issues/16258)) | Research finding | M | M | Pin `@astrojs/vercel` and `astro` versions in `package.json` (`"astro": "6.x.y"`, `"@astrojs/vercel": "10.0.7"` or whichever pair tests green). Track #16258 before bumping. |
| PWA service-worker pre-caches HTML and serves stale auth-bound pages after sign-in / deploy / suspension | Devil's advocate / Pre-mortem | M | M | Configure `@vite-pwa/astro` with `NetworkFirst` strategy for HTML and authed routes; cache only static assets aggressively. Set cache-control headers explicitly for authed routes via Astro middleware. |
| Hobby invocation budget is shared per account; a runaway preview build chews the budget for all projects | Unknown unknowns | L | M | Keep GameSlot on a dedicated Vercel account or team; monitor invocation count weekly via dashboard or `vercel api` during the first month. |
| Web Push send exceeds 10s default function timeout for slow push endpoints | Devil's advocate | L | M | Add `export const maxDuration = 60` to the push-send route file; parallelize push sends via `Promise.allSettled` so one slow endpoint does not block others; handle 410/404 responses to prune dead subscriptions. |
| Supabase redirect URI drift after attaching a custom domain | Unknown unknowns | M | H (auth breaks for production users) | After attaching any custom domain, manually verify the redirect URI list in Supabase Auth settings includes the production URL; document this step in the deploy plan; consider deferring custom domain until v2 — `.vercel.app` is fine for friend-group invite links. |
| Function invocation budget burns silently from misconfigured PWA background sync | Devil's advocate | L | H (app pauses until window resets) | Monitor invocation count weekly via dashboard or `vercel api` during the first month; if PWA background sync is added, gate it behind explicit user action (not auto-poll). |
| Astro adapter is recent (v10) and Astro itself is mid-major-version (6.x current in May 2026) | Unknown unknowns | L | M | Pin `astro` and `@astrojs/vercel` to known-green versions in `package.json`. Do not run `npm update` without a manual review of changelogs. |
| Vercel MCP is public beta — schema or auth flow may change before GA | Research finding | L | L | Treat MCP as a productivity accessory, not a deploy dependency. The CLI (`vercel deploy`, `vercel logs`, `vercel rollback`) is the GA path and the system of record. |
| Vercel Edge runtime soft-deprecation may affect future Astro middleware | Research finding | L | L | Keep middleware on the default Astro middleware (server) path; do not opt middleware into Edge runtime unless a specific need arises. |
| Hobby tier team membership = single owner — no shared deploy access | Unknown unknowns | L | L | Acceptable for solo dev MVP. Revisit if co-maintainer joins (forces Pro upgrade $20/mo or shared credentials). |
| `astro preview` is unsupported by `@astrojs/vercel` | Research finding | L | L | Use `vercel dev` for production-build preview when shape-of-deploy matters; for fast iteration use `astro dev` (the Vite-backed dev server is the right local-dev tool for Astro 6 on Vercel). |
| Repo currently has `@astrojs/cloudflare@13.5.0` installed and `wrangler.jsonc` present despite tech-stack.md naming Vercel | Research finding | H | M | Adapter swap is itemized in `## Getting Started` step 1; do not skip the `npm uninstall @astrojs/cloudflare wrangler` step. |

## Getting Started

The following commands were validated against `@astrojs/vercel@10.0.7` + Astro 6.x + the current Vercel CLI as of 2026-05-25. The repo currently has `@astrojs/cloudflare@13.5.0` installed; step 1 includes the cleanup.

1. **Swap the adapter** (Cloudflare → Vercel):
   ```bash
   npm uninstall @astrojs/cloudflare wrangler
   rm wrangler.jsonc
   npx astro add vercel
   ```
   The `astro add` command edits `astro.config.mjs` to add `import vercel from '@astrojs/vercel'` and `adapter: vercel()`, and confirms `output: 'server'`. Verify the diff and commit.

2. **Install the Vercel CLI globally** (one-time):
   ```bash
   npm i -g vercel
   ```

3. **Link the project to a Vercel deployment** (interactive — answers create the project on first run):
   ```bash
   vercel link
   ```

4. **Install the Supabase Vercel integration** via the Vercel dashboard (Marketplace → Supabase → Connect). It auto-syncs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to all environments and registers a deploy webhook for redirect-URI updates. Also configure the Google OAuth provider in Supabase (Studio → Authentication → Providers → Google) — this is FR-001's auth path and is NOT currently configured in `supabase/config.toml`.

5. **Install PWA + Web Push dependencies** and wire the service worker:
   ```bash
   npm install @vite-pwa/astro web-push
   npx web-push generate-vapid-keys
   vercel env add VAPID_PUBLIC
   vercel env add VAPID_PRIVATE
   vercel env add VAPID_SUBJECT
   ```
   Reference as `import.meta.env.VAPID_*` inside Astro server routes; configure `@vite-pwa/astro` in `astro.config.mjs` with `NetworkFirst` for HTML (see risk register).

6. **For local dev, use `astro dev`** (Vite-backed, fastest iteration — the Astro 6 dev server provides the runtime fidelity needed for almost all work). Only use `vercel dev` when testing Vercel-specific routing / redirects / middleware shape before a production deploy — `astro preview` is not supported by `@astrojs/vercel`, so production-build preview requires `vercel dev` or a temporary adapter swap to `@astrojs/node`.

7. **First production deploy**:
   ```bash
   vercel --prod
   ```
   Returns the production URL. From there, `git push` to the default branch auto-deploys; PRs auto-create preview deploys.

8. **Rollback** (when needed; Hobby is restricted to the immediately-previous production deployment):
   ```bash
   vercel rollback <previous-deployment-url>
   ```

9. **Tail logs**:
   ```bash
   vercel logs <deployment-url> --follow
   ```

10. **(Optional) Add Vercel MCP for agent-driven ops** — public beta as of Feb 2026:
    ```bash
    claude mcp add --transport http vercel https://mcp.vercel.com
    ```
    Treat as accessory; CLI remains the system of record.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (Vercel Hobby uses managed runtimes; not applicable).
- CI/CD pipeline setup beyond Vercel's built-in GitHub integration (`.github/workflows/ci.yml` already runs lint + build; Vercel handles the deploy step natively).
- Production-scale architecture (multi-region, HA, DR — MVP is single-region per interview Q4).
- Custom-domain setup (deferred — `.vercel.app` is sufficient for the friend-group invite-link model in v1).
- Cost projections beyond Hobby tier (project is expected to stay free; Pro tier upgrade triggers and pricing are not modeled here).
