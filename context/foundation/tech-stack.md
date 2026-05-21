---
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
---

## Why this stack

Solo host shipping a small-group board-game scheduler in a 3-week MVP window
with a hard 2026-06-10 deadline. The recommended default for `(web, js)` —
10x Astro Starter — clears all four agent-friendly gates and packages the
exact concerns GameSlot's PRD names: third-party single sign-on (FR-001),
Postgres-backed groups/availability via Supabase, mobile-first shared
calendar via Astro+React+Tailwind, and the service-worker prerequisite for
FR-012 push notifications via the PWA non-functional requirement (now
explicit in the PRD; installable + service worker, offline-write deferred).
Deployment is Vercel (serverless Node runtime), chosen by
`/10x-infra-research` after a three-lens anti-bias cross-check that
surfaced Astro 5 + `@supabase/ssr` + Workers friction on the original
Cloudflare pick — so this hand-off overrides the starter's Cloudflare-
flavored default. The first post-scaffold tasks are therefore: (1) swap
`@astrojs/cloudflare` for `@astrojs/vercel@10`, (2) pin `astro@5.x`, and
(3) install `@vite-pwa/astro` for the service-worker/PWA wiring. CI on
GitHub Actions with auto-deploy-on-merge (Vercel's GitHub integration
handles the deploy trigger natively — no workflow file needed for the
deploy itself). Bootstrapper confidence is first-class: scaffolding works
end-to-end but the adapter swap and PWA wiring are named manual steps.
See `context/foundation/infrastructure.md` for the full deployment
decision, operational story, and risk register.
