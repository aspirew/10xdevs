---
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
---

## Why this stack

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
