---
project: game-slot
researched_at: 2026-05-21
recommended_platform: vercel
runner_up: cloudflare-workers
context_type: mvp
tech_stack:
  language: javascript
  framework: astro-5
  runtime: node
  database: supabase-postgres
---

## Recommendation

**Deploy on Vercel (Hobby plan, Node.js runtime).**

Vercel is the lowest-friction path to ship GameSlot inside the 3-week MVP window with `@astrojs/vercel@10` + Supabase Auth + `@vite-pwa/astro` + Web Push, and the user explicitly prioritized stability and PWA support over absolute lowest cost. The official Supabase integration auto-syncs `SUPABASE_URL` / `SUPABASE_ANON_KEY` to every environment and auto-updates Auth redirect URIs for each preview deploy — eliminating the most common Astro 5 + Supabase SSR failure mode (broken OAuth redirects on PR previews). Hobby tier is hard-capped (no surprise bills) and fits the personal-use carve-out for a non-monetized friend-group app. The trade-off — Vercel's commercial-use ToS clause — is captured in the risk register with mitigation.

## Platform Comparison

Five criteria scored Pass / Partial / Fail per platform. Soft weights derived from the developer interview: cost-minimize (Q2), no existing platform familiarity (Q3), single-region (Q4), external managed services (Q5). Hard filter from interview Q1 (no persistent connections required) dropped no platforms.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / integration | Raw |
|---|---|---|---|---|---|---|
| **Vercel** (recommended) | Pass | Pass | Pass | Pass (hard-cap, no surprise bills) | Partial (MCP public beta) | 4.5/5 |
| **Cloudflare (Workers)** (runner-up) | Pass | Pass | **Pass+** (llms.txt + per-product) | Pass | Pass (API MCP GA) | 5/5 |
| **Netlify** (third) | Pass | Pass | Pass | Pass (rollback UI-only) | Pass | 4.5/5 |
| Render | Pass | Pass | Pass | Pass | Pass (MCP GA, safe scope) | 5/5 |
| Railway | Pass | Pass | Pass | Partial (no rollback CLI) | Pass | 4/5 |
| Fly.io | Pass | Partial (Dockerfile, auto-gen broken on Astro 5) | Pass | Pass | Partial (`fly mcp` experimental) | 4/5 |

### Shortlisted Platforms

#### 1. Vercel (Recommended)

`@astrojs/vercel@10` is the canonical Astro 5 SSR adapter; `output: 'server'` + `adapter: vercel()` is the default install. The Supabase Vercel integration is the differentiator for this stack — preview-deploy auth redirect URIs are kept in sync automatically, which is the single largest source of SSR-auth pain on every other platform researched. Hobby plan: 100 GB Fast Data Transfer, 1M Function Invocations, 1M Edge Requests, 100 deploys/day, 10s default function timeout (configurable to 60s per route via `export const maxDuration = 60`), hard-cap on overage. Vercel MCP is public beta (since Aug 2025) — `claude mcp add --transport http vercel https://mcp.vercel.com`; until GA, treat as a useful but not load-bearing accessory.

#### 2. Cloudflare Workers (Runner-up)

Highest raw score (5/5) and the strongest economics — Workers Free is 100k requests/day with unlimited bandwidth, hard-stop (no overage bill), no commercial-use restriction. **Why it's runner-up and not recommended for this stack:** `@astrojs/cloudflare` v12+ migrated from Pages to Workers Static Assets in late 2025, and the combination Astro 5 SSR + `@supabase/ssr` + Workers has multiple unresolved community issues at research time (supabase/supabase#37592 "dynamic require of 'stream' not supported", supabase/ssr#56 cookie-size overflow with Google OAuth). The fixes exist (pin `@supabase/ssr ≥ 0.10.0`, enable `nodejs_compat`, route OAuth via Workers KV-backed Astro Sessions if cookies overflow) but cost real implementation hours that the 3-week MVP window cannot absorb. Become the recommendation in v2 once GameSlot is live and cost > stability.

#### 3. Netlify

Solid middle ground. `@astrojs/netlify@7` maps Astro routes to Node Functions and middleware to Edge Functions automatically. `netlify logs` CLI hit GA on 2026-05-01. `@netlify/mcp` is production-listed. **Why it's third:** legacy free tier (125k function invocations/mo) is being deprecated for new accounts since 2025-09-04, replaced by a credit-based plan (300 credits/mo, 2 credits/10k web requests). Every SSR page render = 1 function invocation, so the budget is tighter than it appears. Manageable for a 5–10 person friend group but the trajectory is the wrong direction.

## Anti-Bias Cross-Check: Vercel

### Devil's Advocate — Weaknesses

1. **Hobby ToS commercial-use clause is broad and enforced at sole discretion.** Defined as *"any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project, including a paid employee or consultant writing the code."* GameSlot fits the personal-use carve-out today; the risk is interpretation drift if the user later runs paid work under the same Vercel account.
2. **PWA service-worker scope can collide with Vercel's edge-cached HTML.** Aggressive HTML pre-cache via `@vite-pwa/astro` can serve stale auth-bound pages to newly-signed-in users until the SW cache invalidates. Mitigation: `NetworkFirst` strategy for HTML, explicit cache-control on authed routes.
3. **`@astrojs/vercel` does not support `astro preview`** — production-build preview requires `vercel dev` (which needs `vercel link` + env-var pull) or temporary `@astrojs/node` adapter swap. Small but recurring friction during the 3-week MVP.
4. **Function invocations are per-page-load on SSR.** PWA background sync misconfig can silently burn the 1M/mo budget. Hard-cap means the app *stops working* on day-of-overage with no recourse until next billing cycle or paid upgrade.
5. **Web Push from the Node runtime defaults to a 10s function timeout.** Pushing to ~10 group members fits comfortably; slow push services (some browser endpoints) can exceed it. Mitigation: `export const maxDuration = 60` on the push-send route.

### Pre-Mortem — How This Could Fail

It's 2026-11. GameSlot launched on Vercel Hobby in week 3 of the MVP. The first month was perfect: Supabase Auth previews auto-resolved via the Vercel integration, push notifications fired on session confirms, the friend group used it weekly. In month two the host built a second project — a small client gig — and deployed it under the same Vercel account, charging a flat fee. Vercel's automated commercial-use scan flagged the account; both projects' Hobby deployments were suspended pending review. GameSlot went dark for 11 days while the host argued the ToS interpretation; by the time the second project was migrated to a separate Vercel team and the original deployment was restored, the friend group had lost the habit and stopped marking availability. Compounding it: the host had configured the PWA service worker to pre-cache HTML for offline-first reads, and the cache served the now-broken pre-suspension HTML to repeat visitors for a full week after restoration — they thought the app was permanently dead.

### Unknown Unknowns

- **Vercel's Supabase integration auto-updates redirect URIs at integration-install time and on deploy webhooks**, but a manually-added custom domain mid-flight can drift the redirect URI list and silently break production auth. The integration UI does not surface this clearly.
- **Vercel Edge runtime is GA but officially recommends migrating to Node.js.** Tutorials from 2023–2024 that recommend Edge for Astro routes are now operating against the platform's stated direction.
- **`@astrojs/vercel@10` was published very recently** (May 2026 per npm). StackOverflow answers from v8/v9 era describe different middleware and image-optimization behavior than what installs today.
- **Hobby tier hard-cap suspends features per project but invocation budget is shared per account.** A runaway PR preview build can chew the budget for the whole account.
- **Hobby tier teams cannot have additional members.** If the user wants a friend to help maintain the app later, this forces a Pro upgrade ($20/mo) or shared credentials (bad security posture).

## Operational Story

How Vercel actually operates day-to-day for GameSlot.

- **Preview deploys**: every push to a non-default branch and every PR triggers an auto-deploy at `<project>-<branch-hash>-<scope>.vercel.app`. Supabase integration writes preview-specific redirect URIs back to the Supabase project via webhook so OAuth callbacks resolve on the preview URL. Previews are public by default — for a personal friend-group app this is acceptable; if invite-link confidentiality matters more (PRD's `## Open Questions` item 1), gate previews via Vercel Password Protection (paid feature) or rely on the Supabase Auth flow itself to block unauthorized access. Fork PRs deploy without secret access (no env vars exposed) — safe by default.
- **Secrets**: env vars live in Vercel's project settings, scoped per environment (Production / Preview / Development). Supabase integration syncs `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. VAPID push keys (`VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`) are added manually via `vercel env add` or the dashboard. Rotation: `vercel env rm <name>` + re-add + redeploy. Read access: project owner only on Hobby (no additional team members).
- **Rollback**: `vercel rollback <deployment-url>` returns to a previous deployment in seconds (zero-downtime). Hobby retains deploy history indefinitely on free tier. **Data caveat**: rollback rolls back code only — Supabase schema migrations are independent and do not roll back. Migration ordering: apply schema-additive changes (new columns/tables) before code deploy; defer schema-removing changes until after the new code has bedded in for ≥24h.
- **Approval**: agent may perform unattended: `vercel`, `vercel --prod`, `vercel logs`, `vercel env pull`, `vercel rollback`. Human-only: `vercel teams switch`, billing changes, env var creation for new secrets (the user pastes the secret value into the terminal — the agent reads it from the env, not from chat), custom domain attach/detach, Supabase project deletion or migration squashes.
- **Logs**: `vercel logs <deployment-url> --follow` for live tail; `vercel logs <deployment-url>` for recent. Build logs land in the dashboard and via the same CLI. Vercel MCP (public beta) exposes structured log queries — useful when the agent needs to read logs as part of a debugging loop without copy-pasting CLI output.

## Risk Register

Every row names the lens that surfaced it. Likelihood and Impact are L/M/H. Mitigations are concrete actions, not categories.

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Vercel Hobby ToS commercial-use clause triggered if user later deploys paid work under same account | Devil's advocate / Pre-mortem | M | H | Keep GameSlot in a **separate Vercel team** from any future commercial work; never accept payment for GameSlot itself; if monetization is ever considered, plan upgrade to Pro pre-emptively. Re-read fair-use guidelines quarterly. |
| PWA service-worker pre-caches HTML and serves stale auth-bound pages after sign-in / deploy / suspension | Devil's advocate / Pre-mortem | M | M | Configure `@vite-pwa/astro` with `NetworkFirst` strategy for HTML and authed routes; cache only static assets aggressively. Set cache-control headers explicitly for authed routes via Astro middleware. |
| `@astrojs/vercel@10` was published in May 2026 and behavior differs from v8/v9 tutorials | Unknown unknowns | H | L | Pin adapter version in `package.json` (`"@astrojs/vercel": "10.0.7"`) at scaffold time; only follow the live docs at docs.astro.build/en/guides/integrations-guide/vercel/ — not blog posts from 2024. |
| Vercel MCP is public beta — schema or auth flow may change before GA | Research finding | L | L | Treat MCP as a productivity accessory, not a deploy dependency. The CLI (`vercel deploy`, `vercel logs`, `vercel rollback`) is the GA path and the system of record. |
| Web Push send exceeds 10s default function timeout for slow push endpoints | Devil's advocate | L | M | Add `export const maxDuration = 60` to the push-send route file; parallelize push sends via `Promise.allSettled` so one slow endpoint does not block others; handle 410/404 responses to prune dead subscriptions. |
| Supabase redirect URI drift after attaching a custom domain | Unknown unknowns | M | H (auth breaks for production users) | After attaching any custom domain, manually verify the redirect URI list in Supabase Auth settings includes the production URL; document this step in the deploy plan; consider deferring custom domain until v2 — `.vercel.app` is fine for friend-group invite links. |
| Function invocation budget burns silently from misconfigured PWA background sync | Devil's advocate | L | H (app pauses for up to 30 days) | Monitor invocation count weekly via dashboard or `vercel api` during the first month; if PWA background sync is added, gate it behind explicit user action (not auto-poll). |
| Astro adapter is recent (v10) and Astro itself is mid-major-version (5 stable, 6 beta in research window) | Unknown unknowns | L | M | Pin `astro@5.x` and `@astrojs/vercel@10.x` in `package.json`. Do not run `npm update` without a manual review of changelogs. |
| Vercel Edge runtime soft-deprecation may affect future Astro middleware | Research finding | L | L | Keep middleware on the default Astro middleware (server) path; do not opt middleware into Edge runtime unless a specific need arises. |
| Hobby tier team membership = single owner — no shared deploy access | Unknown unknowns | L | L | Acceptable for solo dev MVP. Revisit if co-maintainer joins. |

## Getting Started

The following commands were validated against `@astrojs/vercel@10.0.7` + Astro 5 + the current Vercel CLI as of the research date. Do not copy from older tutorials.

1. **Install the Vercel adapter** (Astro 5; the v10.x line targets the Node runtime by default):
   ```bash
   npx astro add vercel
   ```
   This edits `astro.config.mjs` to add `import vercel from '@astrojs/vercel'` and `adapter: vercel()`, and sets `output: 'server'` if not already set.

2. **Install the Vercel CLI globally** (one-time):
   ```bash
   npm i -g vercel
   ```

3. **Link the project to a Vercel deployment** (interactive — answers create the project on first run):
   ```bash
   vercel link
   ```

4. **Install the Supabase Vercel integration** via the Vercel dashboard (Marketplace → Supabase → Connect). It auto-syncs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to all environments and registers a deploy webhook for redirect-URI updates.

5. **Add VAPID push keys as secrets**:
   ```bash
   npx web-push generate-vapid-keys
   vercel env add VAPID_PUBLIC
   vercel env add VAPID_PRIVATE
   vercel env add VAPID_SUBJECT
   ```
   Use the same values in `import.meta.env.VAPID_*` inside Astro server routes.

6. **For local dev, prefer `astro dev`** (Vite-backed, fastest iteration). Only use `vercel dev` when testing Vercel routing / redirects / middleware shape before a production deploy — `astro preview` is not supported by `@astrojs/vercel`, so production-build preview requires `vercel dev` or a temporary adapter swap to `@astrojs/node`.

7. **First production deploy**:
   ```bash
   vercel --prod
   ```
   Returns the production URL. From there, `git push` to the default branch auto-deploys; PRs auto-create preview deploys.

8. **Rollback** (when needed):
   ```bash
   vercel rollback <previous-deployment-url>
   ```

9. **Tail logs**:
   ```bash
   vercel logs <deployment-url> --follow
   ```

10. **(Optional) Add Vercel MCP for agent-driven ops** — public beta as of 2026-05-21:
    ```bash
    claude mcp add --transport http vercel https://mcp.vercel.com
    ```
    Treat as accessory; CLI remains the system of record.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (Vercel Hobby uses managed runtimes; not applicable).
- CI/CD pipeline setup beyond Vercel's built-in GitHub integration.
- Production-scale architecture (multi-region, HA, DR — MVP is single-region).
- Custom-domain setup (deferred — `.vercel.app` is sufficient for the friend-group invite-link model in v1).
- Cost projections beyond Hobby tier (project is expected to stay free; Pro tier upgrade triggers and pricing are not modeled here).
