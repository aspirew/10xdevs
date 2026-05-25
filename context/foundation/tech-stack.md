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
with a hard 2026-06-10 deadline. Standard path: `10x-astro-starter` is the
recommended default for `(web-app, js)` and clears all four agent-friendly
gates — Astro 6 + React 19 + TypeScript + Tailwind 4 + Supabase covers
third-party SSO (FR-001), Postgres-backed groups/availability, and the
mobile-first shared calendar in one opinionated package. Deployment is Vercel,
locked by the prior `/10x-infra-research` after a three-lens anti-bias review
that flagged Astro + `@supabase/ssr` + Workers friction on the starter's
default Cloudflare path; the Supabase Vercel integration auto-syncs OAuth
redirect URIs across previews, eliminating the single largest SSR-auth pain
point. CI runs on GitHub Actions with auto-deploy-on-merge (Vercel's GitHub
integration handles the deploy step natively). Bootstrapper confidence is
first-class. Known manual post-scaffold work, documented in
`infrastructure.md`: swap `@astrojs/cloudflare` for `@astrojs/vercel@10`,
configure Supabase Google OAuth (FR-001), and install `@vite-pwa/astro` plus
Web Push (VAPID) for the PWA NFR and FR-012 push notifications — no js
starter in the registry covers PWA + Web Push first-class, so this is the
documented manual line item.
