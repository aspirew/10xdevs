---
bootstrapped_at: 2026-05-21T22:19:00Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: game-slot
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

Hand-off frontmatter (verbatim from `context/foundation/tech-stack.md`):

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: game-slot
hints:
  language_family: js
  team_size: solo
  deployment_target: vercel
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Why-this-stack paragraph (verbatim):

> Solo host shipping a small-group board-game scheduler in a 3-week MVP window
> with a hard 2026-06-10 deadline. The recommended default for `(web, js)` —
> 10x Astro Starter — clears all four agent-friendly gates and packages the
> exact concerns GameSlot's PRD names: third-party single sign-on (FR-001),
> Postgres-backed groups/availability via Supabase, mobile-first shared
> calendar via Astro+React+Tailwind, and the service-worker prerequisite for
> FR-012 push notifications via the PWA non-functional requirement (now
> explicit in the PRD; installable + service worker, offline-write deferred).
> Deployment is Vercel (serverless Node runtime), chosen by
> `/10x-infra-research` after a three-lens anti-bias cross-check that
> surfaced Astro 5 + `@supabase/ssr` + Workers friction on the original
> Cloudflare pick — so this hand-off overrides the starter's Cloudflare-
> flavored default. The first post-scaffold tasks are therefore: (1) swap
> `@astrojs/cloudflare` for `@astrojs/vercel@10`, (2) pin `astro@5.x`, and
> (3) install `@vite-pwa/astro` for the service-worker/PWA wiring. CI on
> GitHub Actions with auto-deploy-on-merge (Vercel's GitHub integration
> handles the deploy trigger natively — no workflow file needed for the
> deploy itself). Bootstrapper confidence is first-class: scaffolding works
> end-to-end but the adapter swap and PWA wiring are named manual steps.
> See `context/foundation/infrastructure.md` for the full deployment
> decision, operational story, and risk register.

## Pre-scaffold verification

| Signal       | Value                                                          | Severity | Notes                                                                  |
| ------------ | -------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| npm package  | not run                                                        | n/a      | cmd_template starts with `git clone`; no npm CLI to query              |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17       | fresh    | from card.docs_url; checked via curl fallback (gh CLI unavailable)     |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (clone the starter repo without keeping its upstream history)
**Exit code**: 0 (clone) + 0 (npm install)
**npm install summary**: 774 packages added, 775 audited in 7s
**npm install warnings**:
- `EBADENGINE` — starter declares `node: ^20.19.0 || ^22.13.0 || >=24`; local Node is `v23.1.0` (between supported ranges). Informational; npm did not block.
- Two deprecated transitive packages: `@babel/plugin-proposal-private-methods@7.18.6` (merged into ES standard), `node-domexception@1.0.0` (use native DOMException).
**Files moved**: 0 net new files into cwd. The full file-by-file diff (`diff -qr .bootstrap-scaffold/ ./`) showed only one delta — `CLAUDE.md` differs because cwd's CLAUDE.md is the skill-dev augmented copy (13540B) while the starter ships a 3164B template. Cwd already had `CLAUDE.md.scaffold` from the May 20 bootstrap matching the freshly cloned `CLAUDE.md` byte-for-byte, so no new sibling was needed.
**Conflicts (.scaffold siblings)**: none new this run. Pre-existing `CLAUDE.md.scaffold` (3164B, from May 20) verified to match the fresh starter's CLAUDE.md.
**.gitignore handling**: identical in scaffold and cwd (both 299B, byte-for-byte match) — no append-merge needed.
**.bootstrap-scaffold cleanup**: deleted.

**Deliberate user-authorized deviation from the strict conflict matrix**: before move-up, the user opted to skip `node_modules/` (which the cmd_template's `npm install` produced inside `.bootstrap-scaffold/`) to avoid ~500MB of byte-identical duplicates getting renamed to `.scaffold` siblings across thousands of dependency files. `.git/` was also deleted before move-up per the git-clone strategy spec. The remaining source/config files were diffed; identical files left alone, no merge step was needed. This deviates from the spec's per-file conflict matrix but preserves the spec's intent (no data loss; surface real differences).

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0 — 2 direct (both moderate); 8 transitive (1 high, 7 moderate)

#### HIGH findings

- **devalue** (transitive via `devalue` itself) — moderate-rated CVE escalated to "high" severity by npm's severity model. Pulled in via `@astrojs/cloudflare` → `wrangler` → downstream Cloudflare tooling chain. Likely removed when `@astrojs/cloudflare` is swapped for `@astrojs/vercel` per `infrastructure.md`. Resolution before adapter swap: `npm audit fix` (may force a breaking-changes prompt).

#### MODERATE findings

Direct:
- **@astrojs/check** — pulled via `@astrojs/language-server`. Type-checking tool; will remain a direct dep regardless of platform.
- **wrangler** — pulled via `miniflare`. Cloudflare-specific; expected to be removed during the planned `@astrojs/cloudflare` → `@astrojs/vercel@10` adapter swap. This single removal should resolve several of the transitive findings below.

Transitive (resolved by upstream package bumps or by removing the Cloudflare chain entirely):
- `@astrojs/language-server` (via `volar-service-yaml`)
- `@cloudflare/vite-plugin` (via `miniflare`, `wrangler`, `ws`) — will go away with adapter swap
- `miniflare` (via `ws`) — same
- `volar-service-yaml` (via `yaml-language-server`)
- `ws` (via `ws`) — same
- `yaml` (via `yaml`)
- `yaml-language-server` (via `yaml`)

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                              |
| path_taken                 | standard                           |
| self_check_answers         | null                               |
| team_size                  | solo                               |
| deployment_target          | vercel                             |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | false                              |
| has_background_jobs        | false                              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. (This cwd already has a `.git/` from the dev environment.)
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep. (This run created none; only the pre-existing `CLAUDE.md.scaffold` from May 20 remains, and it has been verified to still match the upstream starter's CLAUDE.md.)
- Address audit findings per your project's risk tolerance — the full breakdown is above. The single HIGH (`devalue`) and several transitive MODERATEs are expected to clear once `@astrojs/cloudflare` is swapped for `@astrojs/vercel@10` (planned in `context/foundation/infrastructure.md`).
- Project-specific post-scaffold work named in `tech-stack.md` / `infrastructure.md`:
  1. `npm rm @astrojs/cloudflare && npm i @astrojs/vercel@10` (adapter swap).
  2. Pin `astro@5.x` in `package.json` to avoid picking up Astro 6 beta.
  3. `npm i @vite-pwa/astro` and wire the service worker for FR-012 push notifications.
  4. Run `vercel link` once and install the Supabase Vercel integration via the dashboard.

## Environment notes

- Node version at scaffold time: `v23.1.0` (npm `10.9.0`). Starter's declared engine range is `node: ^20.19.0 || ^22.13.0 || >=24`. Node 23.x is outside the supported ranges — npm issued an `EBADENGINE` warning but did not block. Recommendation: align local Node to one of the supported ranges (`nvm install 22.13` or `nvm install 24`) before doing serious dev work; `.nvmrc` from the starter pins the intended version.
- `gh` CLI unavailable in this environment; pre-scaffold GitHub recency check used `curl` fallback against the public API (anonymous; rate-limited but sufficient for one read).
