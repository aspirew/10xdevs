---
change_id: google-oauth-signin
title: Wire Google OAuth sign-in for GameSlot
status: implementing
created: 2026-05-27
updated: 2026-05-27
archived_at: null
---

## Notes

Roadmap source: F-01 in `context/foundation/roadmap.md` (Change ID `google-oauth-signin`).

**Outcome (verbatim from roadmap):** GameSlot users sign in via Google OAuth; `signInWithOAuth` is wired end-to-end across local dev, preview, and prod; the OAuth callback handler issues a Supabase session.

**PRD refs:** FR-001, §Access Control.

**Unlocks:** S-01, S-02, S-03 — every user-facing slice requires a signed-in member. Critical path.

**Baseline state (from roadmap §Baseline):**
- `[auth.external.google]` block in `supabase/config.toml` is ready for `env()` substitution; no credentials yet.
- No `signInWithOAuth` call exists in the codebase.
- Supabase email/password scaffold present at `src/pages/auth/{signin,signup,confirm-email}.astro` and `src/pages/api/auth/{signin,signup,signout}.ts` — Open Roadmap Question #3 leans toward keeping it dormant (default), not ripping it out, against `top_blocker = time`.
- Google OAuth deferred from `deploy-plan.md` Phase 2 step 10 — most wiring already exists.

**Manual step inside this change (not a separate blocker):** Google Cloud OAuth client creation (client id + secret) and adding them to Vercel env + local `.env`. Plan must call this out as a human-only gate.

**Open question carried in from roadmap:** disposition of inherited email/password auth scaffold — default = keep dormant; rip-out is scope-creep against `time` blocker.
