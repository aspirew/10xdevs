---
change_id: create-group-and-invite
title: Create a friend group and invite friends via a shareable link
status: impl_reviewed
created: 2026-06-01
updated: 2026-06-02
archived_at: null
---

## Notes

Implements FR-002 + FR-003 + FR-004 — create a friend group, generate a shareable invite link, and a signed-in user who opens that link joins the group.

Roadmap source: S-01 in `context/foundation/roadmap.md` (Change ID `create-group-and-invite`).

**Outcome (verbatim from roadmap):** A signed-in user can create a friend group, generate a shareable invite link for that group, and a different signed-in user who opens that link joins the group.

**PRD refs:** FR-002, FR-003, FR-004, US-01 (Given clause: "a group exists, every member has signed in and joined the group").

**Prerequisites:** F-01 (done; archived at `context/archive/2026-05-27-google-oauth-signin/`). Every flow in this change assumes `Astro.locals.user` is populated by `src/middleware.ts`.

**Unlocks:** S-02 (mark-availability-with-overlap) — availability rows hang off `(group_id, user_id)`. S-03 (confirm-session-with-push-notification) — sessions belong to a group. RLS posture set here gets copied by S-02 and S-03.

**Baseline (from roadmap §Baseline as of 2026-05-27):**
- `supabase/migrations/` is empty (only `config.toml`); zero domain tables. This is the first migration.
- `@supabase/ssr` + `@supabase/supabase-js` wired in `src/lib/supabase.ts` with cookie-based session.
- No groups / group_members / sessions / availability tables exist.

**Open question carried from roadmap (Open Q #1):** invite-link lifecycle — expiry / rotation / revoke. Roadmap notes "no for v1 (single-group validation); revisit before any growth phase." Plan should record the v1 decision (likely "tokens are persistent + non-rotating + non-expiring; revoke by deleting the row") rather than leave it open.

**Architectural anchor (per roadmap §S-01 Risk note):** "Schema decisions for `groups` and `group_members` land here, including the privacy NFR's RLS posture. Get the RLS pattern right once because S-02 and S-03 will copy it for their tables." → invest in the RLS design here; downstream slices will benefit.

**PRD §Access Control reminders:**
- Membership is flat at the group level (no roles); "host" is a per-session role landing in S-03, not here.
- "A group's membership and its members' availability are visible only to members of that group" — applies starting at the `groups` and `group_members` tables.

**Lessons priors** (from `context/foundation/lessons.md`):
- *Verify integration auto-sync claims empirically* — if any planning step leans on a Supabase or Vercel integration behavior (e.g. auto-RLS, auto-policy generation), treat it as unverified until exercised.
- *Reconcile Marketplace-provisioned backend resources with any pre-existing local .env* — the dev `.env` (`uldvnsbhztupwemzityg`) and the prod-bound Supabase project (`dchurjcpgzuoyunjsokl`) are different tenants. Schema migrations and RLS policies need to land on BOTH — verify, don't assume.
