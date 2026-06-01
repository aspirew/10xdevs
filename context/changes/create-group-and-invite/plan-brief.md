# Create a Friend Group and Invite Friends — Plan Brief

> Full plan: `context/changes/create-group-and-invite/plan.md`

## What & Why

Implements PRD FR-002 + FR-003 + FR-004 + the Given clause of US-01: a signed-in user creates a friend group, generates a shareable invite link, and a second signed-in user who opens that link joins. This is the first user-visible vertical slice on top of F-01's auth, and the first DB schema + RLS the project ships — patterns S-02 (availability) and S-03 (session confirmation + push) will copy.

## Starting Point

F-01 (Google OAuth) is archived and verified end-to-end on localhost + prod + preview. The DB has zero domain tables (no `supabase/migrations/` directory yet). `src/middleware.ts` populates `Astro.locals.user`; gating today only covers `/dashboard` (a placeholder). Two Supabase projects exist (`uldvnsbhztupwemzityg` local-bound, `dchurjcpgzuoyunjsokl` Vercel-bound) — per `lessons.md` rule #2, the plan consolidates onto the Vercel-bound project as a Prerequisites step.

## Desired End State

`https://10xdevs-lilac.vercel.app/groups` lists the groups the signed-in user belongs to. Clicking "New group" → entering a name → submit → lands on `/groups/<id>` showing one member (the creator) and an invite link of the form `/invite/<token>`. Sharing that link to a different signed-in user lands them on `/groups/<id>` with two members visible. RLS guarantees a user not in the group reads zero rows for that group via the REST API. Post-auth landing changes from `/` to `/groups`; the placeholder `/dashboard` is retired.

## Key Decisions Made

| Decision                                       | Choice                                                                                                                                              | Why (1 sentence)                                                                                                                                                          | Source     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Schema shape                                   | Two tables: `groups` (id, name, created_by, `invite_token`, created_at) and `group_members` (group_id, user_id, joined_at; composite PK)            | Every column is a downstream commitment; this is the minimum that supports FR-002/003/004 and S-02/S-03's foreign keys.                                                  | Plan       |
| Invite-token model (roadmap Open Q #1)         | Single `invite_token` column ON the `groups` row; persistent + non-expiring; regenerate = `UPDATE` = revoke; no separate `invites` table            | Roadmap deferred lifecycle nuances to v2; the single-token model handles friend-group v1 cleanly without a parallel table or expiry job.                                  | Plan       |
| RLS recursion fix                              | `SECURITY DEFINER` SQL helper `is_group_member(g uuid)` used inside policies on both `groups` and `group_members`                                   | Naive self-referential policy on `group_members` recurses; the security-definer helper bypasses RLS for its inner read, the standard Postgres pattern.                    | Plan       |
| Invite-acceptance auth flow                    | Anonymous visitor to `/invite/<token>` renders a "Continue with Google to join <name>" CTA; extends OAuth-start route to accept a `next` form param | Cookie hand-off is more complex; threading `next` through Supabase's `redirectTo` is two 1-line edits at sites we already own (`oauth/google.ts` + `callback.ts`).         | Plan       |
| Same-origin validation for `next`              | URL-parse + origin equality: `new URL(next, origin).origin === origin` (catches backslash-prefix edge cases the naive startsWith heuristic misses)  | Open-redirect prevention; lives in both `oauth/google.ts` and `callback.ts` for defense-in-depth. Rigorous form chosen during plan-review F7.                            | Plan + Review |
| Service-role client                            | New `src/lib/supabase-admin.ts`; used ONLY for invite-token lookup (anonymous visitors) and joining `auth.users` for member emails                  | RLS blocks anonymous reads of `groups`; the lookup HAS to bypass RLS. Confine the admin client to two well-defined sites; the membership INSERT still goes through user-scoped RLS. | Plan       |
| Supabase project consolidation (lessons.md #2) | Repoint local `.env` to `dchurjcpgzuoyunjsokl` (Vercel-bound) as Prerequisites; abandon the stale `uldvnsbhztupwemzityg` project                    | Directly invokes lesson #2 rule (a); migrating every schema change to two tenants is brittle; single-tenant is fine at friend-group v1 scale.                            | Lessons    |
| Post-auth landing                              | `/auth/callback` defaults to `/groups` (was `/`); `/dashboard` deleted; `PROTECTED_ROUTES` gates `/groups*`                                          | The groups list IS the home for an authed user; the dashboard placeholder is redundant; cleanup reduces auth-surface drift.                                              | Plan       |
| Out-of-scope guardrails                        | No real-time updates, no group delete, no leave-group UI, no group roles, no tests added                                                            | Each is its own decision; expanding now bloats the slice without serving v1's wedge validation.                                                                          | Plan       |

## Scope

**In scope:**
- DB: 2 tables (`groups`, `group_members`), 1 helper function (`is_group_member`), 6 RLS policies, in a single migration file.
- Server: 3 new endpoints (`POST /api/groups`, `POST /api/groups/[id]/regenerate-invite`, `/invite/[token].astro` as a server-rendered page), 1 new admin client factory.
- OAuth extension: `?next=` thread-through in `oauth/google.ts` + `callback.ts`.
- UI: 4 new pages (`/groups`, `/groups/new`, `/groups/[id]`, `/invite/[token]`), Topbar update, retire `/dashboard`, post-auth redirect change.
- shadcn primitives: install `card`, `input`, `label`.
- Prerequisites (operational): consolidate to `dchurjcpgzuoyunjsokl` Supabase project, repoint local `.env`.

**Out of scope:**
- Sessions, availability, push (S-02 / S-03 territory).
- Leave-group / delete-group / multiple invite tokens / token expiry / token rotation jobs.
- Group roles / admin permissions / promote-to-admin flow.
- Real-time `/groups/[id]` updates (no Supabase Realtime subscription).
- Test runner / unit tests / integration tests (no test suite in the repo).
- Custom-domain attach (deferred per `infrastructure.md` risk register).

## Architecture / Approach

```
       Browser                       Astro server                   Supabase (dchurjcpgzuoyunjsokl)
          │                              │                                   │
  GET /groups (authed) ────────────────▶ │ ── SELECT groups (RLS: members) ▶ │
                                         │ ◀───────── rows ─────────────────│
                                         │                                   │
  POST /api/groups {name} ─────────────▶ │ ── INSERT groups (creator=auth)  │
                                         │ ── INSERT group_members(self)  ▶ │
                                         │ ◀── new id ──                    │
        ◀── 302 /groups/<id> ──────────  │                                   │
                                         │                                   │
  GET /invite/<token> (anon) ──────────▶ │ ── (admin client) lookup token ▶ │
                                         │ ◀── group_id, name ─────────────│
  ◀── render "Continue with Google" ─── │                                   │
   POST /api/auth/oauth/google?next=… ▶ │ ── signInWithOAuth(redirectTo+next)
                                         │       ──▶ Google ──▶ Supabase ──▶ /auth/callback?code&next
                                         │ ── exchangeCodeForSession ────▶ │
                                         │ ◀─ session cookies set ─────────│
                                         │ ── (now authed) re-visit /invite/<token>
                                         │ ── INSERT group_members (RLS: self) ▶
        ◀── 302 /groups/<id> ──────────  │                                   │
```

PKCE OAuth flow from F-01 is reused unchanged except for the `next` param thread-through. RLS enforces every read; service-role client is used exclusively for two narrow ops (invite-token lookup, `auth.users` email join).

## Phases at a Glance

| Phase                                                   | What it delivers                                                                                                                  | Key risk                                                                                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisites (operational, ~15 min)                    | Local `.env` repointed at consolidated Supabase project; verify localhost auth still works                                        | Pulling Vercel env to local `.env` may overwrite other keys; restart of `npm run dev` required for Vite to pick up new vars.                          |
| 1. Schema + RLS migration                               | Project's first migration: 2 tables, 1 helper SQL fn, 6 policies, applied to `dchurjcpgzuoyunjsokl`                               | RLS recursion on `group_members`; mitigated by the `is_group_member()` `SECURITY DEFINER` helper.                                                     |
| 2. Server endpoints + OAuth `?next=` extension          | 3 new routes, 1 admin-client factory, 2-line `?next=` thread-through in oauth start + callback                                    | Service-role client misuse — confined to two narrow lookups; new contributors might be tempted to reach for it elsewhere. Comment in the source guards. |
| 3. UI pages + nav update                                | 4 new pages, Topbar refresh, `/dashboard` retired, post-auth landing → `/groups`, shadcn `card/input/label` added                 | None significant; v1 happy path is well-trodden Astro+Supabase territory after F-01.                                                                  |

**Prerequisites:**
- F-01 implementation lives in `context/archive/2026-05-27-google-oauth-signin/` for reference.
- Consolidate to single Supabase project (Prerequisites step in plan).
- Access to Supabase Studio for `dchurjcpgzuoyunjsokl` (via Vercel → Storage → "Open in Supabase").
- Vercel CLI on PATH for the `vercel env pull` step.

**Estimated effort:** ~2 focused sessions across 3 phases. Phase 1 ~30 min (migration write + Studio apply + smoke). Phase 2 ~1–2 hr (5 files, validation logic, manual smoke). Phase 3 ~1–2 hr (4 pages + Topbar + delete + redirect + e2e on localhost and prod).

## Open Risks & Assumptions

- **Assumption**: the single-project consolidation doesn't break anyone else's work — the user is solo dev (per `tech-stack.md` hints `team_size: solo`), so no coordination cost.
- **Assumption**: `gen_random_uuid()` returns a unique-enough token for friend-group scale (it does — 122 bits of entropy, collision probability negligible for any reasonable N).
- **Risk**: a future contributor reaches for `createAdminClient()` outside the two intended call sites and accidentally bypasses RLS for a normal user operation. Mitigation: source comment explicitly warns; impl-review should catch.
- **Risk**: if the Phase 3 service-role join to `auth.users` (for member emails) is slow at higher scale (it won't be at friend-group scale), we'd need to denormalize emails into `group_members` later. Not a v1 concern.
- **Assumption (revisit at v2)**: invite-link revocation by regeneration is sufficient for the friend-group threat model. If a leaked link becomes a real concern, the schema is already shaped to add expiry (`invite_token_expires_at`) or move to a separate `invites` table.

## Success Criteria (Summary)

- A friend-group member can create a group and invite at least one other person via a link, end-to-end on production. Both members appear in the group's member list.
- RLS guarantees a non-member returns 404 / empty when probing the group's REST endpoint directly. Verified with two distinct Google accounts.
- The next change (`/10x-new mark-availability-with-overlap`) starts from a `(group_id, user_id)` foundation that's been exercised in production — no schema rework needed.
