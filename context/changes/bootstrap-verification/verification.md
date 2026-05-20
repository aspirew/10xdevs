---
bootstrapped_at: 2026-05-20T23:39:00Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: game-slot
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: game-slot
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
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

### Why this stack

Solo host shipping a small-group board-game scheduler in a 3-week MVP window
with a hard 2026-06-10 deadline. The recommended default for `(web, js)` —
10x Astro Starter — clears all four agent-friendly gates and packages the
exact concerns GameSlot's PRD names: third-party single sign-on (FR-001) and
Postgres-backed groups/availability via Supabase, mobile-first shared
calendar via Astro+React+Tailwind, and edge deploy via Cloudflare Pages.
Push notifications on session confirm (FR-012) are request-time, so no
background-jobs flag; realtime updates aren't named in any FR, so polling
the calendar suffices. The user added PWA as an explicit constraint —
patched in via `@vite-pwa/astro`, which also satisfies the service-worker
prerequisite for web push. CI on GitHub Actions with auto-deploy-on-merge
is the starter's standard shape. Bootstrapper confidence is first-class
(CLI registered, expected to work but not battle-tested), so scaffolding
will be mostly smooth with occasional manual steps.

## Pre-scaffold verification

| Signal       | Value                                                         | Severity | Notes                                                                |
| ------------ | ------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| npm package  | not run                                                       | n/a      | cmd_template starts with `git clone`; no npm CLI to version-check    |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17     | fresh    | from card.docs_url (3 days before bootstrap; within 3-month window)  |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold
**.gitignore handling**: moved silently (none pre-existing in cwd)
**.bootstrap-scaffold cleanup**: deleted (and `.bootstrap-scaffold/.git/` removed before move-up, so no upstream history leaked)

Notes:

- The cwd carried a prior `.bootstrap-scaffold/` directory and a prior `verification.md` (`phase_3_status: failed`, 2026-05-20T23:32Z, npm cache EACCES). The user fixed `~/.npm` ownership before re-invoking; the prior `.bootstrap-scaffold/` was wiped with explicit user confirmation.
- npm install completed with engine warnings: starter's transitive `@eslint/*` packages require Node `^20.19.0 || ^22.13.0 || >=24`; the user is on Node 23.1.0. Warnings only — no install failure. Consider switching to Node 22 LTS or Node 24 to silence them.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 10 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/3/0 direct of total 0/1/10/0

#### CRITICAL findings

None.

#### HIGH findings

- **`devalue`** (transitive) — Svelte devalue: DoS via sparse array deserialization. Reached through the Astro/Cloudflare/Vite chain.

#### MODERATE findings

Direct (3):

- **`@astrojs/check`** — vulnerable via `@astrojs/language-server`.
- **`@astrojs/cloudflare`** — vulnerable via `@cloudflare/vite-plugin` and `wrangler`.
- **`wrangler`** — vulnerable via `miniflare`.

Transitive (7):

- `@astrojs/language-server` — via `volar-service-yaml`.
- `@cloudflare/vite-plugin` — via `miniflare` and `wrangler`.
- `miniflare` — via `ws`.
- `volar-service-yaml` — via `yaml-language-server`.
- `ws` — uninitialized memory disclosure.
- `yaml` — stack overflow via deeply nested YAML collections.
- `yaml-language-server` — via `yaml`.

#### LOW / INFO findings

None.

Raw `npm audit --json` output captured (6.7 KB, 285 lines) and consulted to build the breakdown above. Run `npm audit` from project root to regenerate the latest view; `npm audit fix` may resolve a subset without breaking changes.

## Hints recorded but not acted on

| Hint                       | Value                  |
| -------------------------- | ---------------------- |
| bootstrapper_confidence    | first-class            |
| quality_override           | false                  |
| path_taken                 | standard               |
| self_check_answers         | null                   |
| team_size                  | solo                   |
| deployment_target          | cloudflare-pages       |
| ci_provider                | github-actions         |
| ci_default_flow            | auto-deploy-on-merge   |
| has_auth                   | true                   |
| has_payments               | false                  |
| has_realtime               | false                  |
| has_ai                     | false                  |
| has_background_jobs        | false                  |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` and decide whether to merge it into your existing `CLAUDE.md` (the scaffold ships starter-specific agent guidance; the existing file carries lesson instructions).
- Consider aligning Node to 22 LTS or 24 (current: 23.1.0) to silence the `@eslint/*` engine warnings.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log; `npm audit fix` resolves the non-breaking subset, and the 1 HIGH (`devalue`) is transitive and waits on upstream.
