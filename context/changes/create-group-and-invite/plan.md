# Create a Friend Group and Invite Friends — Implementation Plan

## Overview

Land the first vertical user-facing slice of GameSlot: a signed-in member can create a friend group, generate a shareable invite link, and a second signed-in user who opens that link joins the group. Delivers PRD FR-002 + FR-003 + FR-004 + the Given clause of US-01, unlocks every downstream slice (S-02 marks availability against `(group_id, user_id)`; S-03 confirms sessions against a group), and establishes the project's first schema, first migration, and first RLS policy set — patterns S-02 and S-03 will copy.

## Current State Analysis

The auth substrate is solid and groups are the first piece of domain we add:

- **Auth (from F-01)**: `src/middleware.ts:6` populates `Astro.locals.user`. PKCE OAuth round-trip works on localhost / prod / preview (with the wildcard `https://**.vercel.app/auth/callback` workaround captured in lessons.md). Sign-out POST is wired at `src/pages/api/auth/signout.ts`. `Astro.locals.user` typing is `User | null` in `src/env.d.ts`.
- **DB**: zero domain tables. `supabase/migrations/` directory **doesn't exist yet** — `supabase/` contains only `config.toml` and `.gitignore`. This change ships the project's first migration.
- **Two Supabase projects in play** (per `lessons.md` rule #2): local `.env` points at `uldvnsbhztupwemzityg`; the Vercel-bound prod project is `dchurjcpgzuoyunjsokl`. Each has its own DB; any migration we apply needs to land on the *one* we keep. v1 has no genuine dev/prod separation requirement (one friend group; market-feedback goal) — the lesson rule's "(a) point local `.env` at the Vercel-bound resource (delete the stale one)" is the right move.
- **UI**: `src/components/Topbar.astro` shows email + "Dashboard" + "Sign out" when authed. `src/pages/dashboard.astro` is a placeholder ("you're authed"). `src/pages/index.astro` is marketing. `src/components/ui/button.tsx` is the only shadcn primitive installed.
- **OAuth start route** (`src/pages/api/auth/oauth/google.ts:11`): builds `redirectTo` as `${origin}/auth/callback` with no support for a post-sign-in destination. The invite-link flow needs an authed user, so unauthed users opening `/invite/<token>` need to round-trip through Google and land back on the invite page. The cleanest path is to extend the OAuth-start route to accept a `next` form/query param and thread it through Supabase's `redirectTo`, then have `/auth/callback` honor it post-exchange. Currently neither route knows about `next`.
- **Routes today** (per `find src/pages`): `index.astro`, `dashboard.astro`, `auth/{signin,signup,callback}.{astro,ts}`, `api/auth/{signout.ts, oauth/google.ts}`. No `/groups`, no `/invite`.
- **Lessons priors (`context/foundation/lessons.md`)**:
  - "Verify integration auto-sync claims empirically" — applies if any planning step here leans on Supabase auto-generating policies, types, or routes.
  - "Reconcile Marketplace-provisioned backend resources with any pre-existing local .env" — directly drives the consolidation decision below.

## Desired End State

A signed-in user visits `https://10xdevs-lilac.vercel.app/groups` and sees the groups they're a member of. They click "Create group", enter "Game Night Crew", submit, and land on `/groups/<id>` where they see themselves listed as the sole member and a copyable invite link (`https://10xdevs-lilac.vercel.app/invite/<token>`). They share that link in a chat. A second person opens it in their browser: if not signed in, they see a "Sign in to join Game Night Crew" page with a "Continue with Google" button; after consent, they round-trip back to the same invite URL, which inserts them into `group_members` and redirects to `/groups/<id>` where they're now visible to both members. RLS guarantees no other user (not in the group) can read any of this — a curl with another user's session token to `GET /rest/v1/groups?id=eq.<id>` returns empty.

### Key Discoveries:

- Schema needs only TWO tables for the full S-01 surface: `groups` (id, name, created_by, invite_token, created_at) and `group_members` (group_id, user_id, joined_at; PK = composite). All other questions (who's host, what's confirmed, etc.) are S-02/S-03 concerns. **Keep the schema minimal — every column is a downstream commitment.**
- Putting `invite_token` *on* the `groups` row (one token per group) instead of a separate `invites` table is the right call for v1 — single token per group, regenerate to revoke, no expiry, no token list to manage. Roadmap Open Q #1 deferred lifecycle "to v2"; this is the v1 resolution.
- The invite-acceptance flow has to handle anonymous visitors. Extending the existing OAuth-start route at `src/pages/api/auth/oauth/google.ts:6` to accept `next` (a same-origin path) and threading it through Supabase's `redirectTo` query string is cleaner than the cookie-hand-off alternative; the existing `redirectTo` construction at line 11 only needs a query-string concatenation. The `callback.ts:26` redirect target gets the same treatment — read `next` from the query and use it instead of the hardcoded `/`.
- RLS posture (the load-bearing piece per roadmap §S-01 Risk): membership-driven SELECT on both tables. Visibility key = "is `auth.uid()` in `group_members` for this `group_id`?". A `SECURITY DEFINER` SQL function (e.g. `is_group_member(g uuid)`) is the standard pattern for keeping policy SQL readable and avoiding the RLS recursion trap when `group_members` queries itself.
- shadcn primitives present: `button.tsx` only. The plan adds three more (`card`, `input`, `label`) via `npx shadcn add card input label`. No other component library work.

## What We're NOT Doing

- **Not building per-session host logic, sessions table, availability marking, or push notifications** — those are S-02 (availability + overlap) and S-03 (session confirmation + push). Schema here intentionally omits any concept of `sessions`, `session_host`, `availability`, or `notifications`.
- **Not supporting multiple invite links per group or token expiry.** One token per group (column on `groups`), regenerate to revoke. Roadmap Open Q #1 explicitly defers expiry/rotation/revoke nuances to v2.
- **Not adding group roles / admin permissions.** PRD §Access Control: "Membership is flat at the group level." Creator and member have identical reads; only creator can regenerate invite or rename. No promote-to-admin flow.
- **Not adding group delete / archive.** Out of scope; orphaned groups can be left in the DB or cleaned up manually post-v1. If needed for v1, add to the follow-up backlog.
- **Not supporting leave-group from the UI in v1.** Cap the v1 surface at create + invite + join. Leave-group's UX (last member leaves → delete group? transfer ownership?) opens questions we don't need to answer for the wedge validation. The DB DELETE policy on `group_members` is permitted via RLS, but no UI exercises it.
- **Not migrating any existing data**. Both Supabase projects have only auth users (no domain rows). The consolidation in Prerequisites drops the stale `uldvnsbhztupwemzityg` project entirely.
- **Not building real-time membership updates.** No Supabase Realtime subscription on the `/groups/<id>` page; new joiners only appear on page refresh. Fits "Mobile-first usability" NFR (PRD), not a real-time chat product.
- **Not adding tests.** Repo has no test suite (`package.json` scripts: `dev/build/lint/typecheck/format`). Standing up Playwright or Vitest is its own change.

## Implementation Approach

Three code phases, sequenced bottom-up — DB → server → UI — so each phase is verifiable on its own and the implementer hits a working slice at the end of each phase. The Supabase project consolidation happens as a **Prerequisites** step (operational, ~15 min, no source changes), not a phase, so the plan body stays focused on code.

1. **Phase 1: Schema + RLS migration.** Project's first migration. Two tables, one `is_group_member()` helper, six policies. Verified by applying to the consolidated Supabase project and confirming `psql`-equivalent existence checks via Studio's SQL editor.
2. **Phase 2: Server endpoints + OAuth `?next=` extension.** Three new routes (`POST /api/groups`, `POST /api/groups/[id]/regenerate-invite`, `GET /invite/[token]` as an Astro endpoint) plus a 2-line extension to `oauth/google.ts` and `callback.ts` to thread a `next` param through the OAuth round-trip. Verified by `curl` flows against localhost.
3. **Phase 3: UI pages + nav update.** Four new pages (`/groups`, `/groups/new`, `/groups/[id]`, `/invite/[token].astro`), Topbar update to add a "Groups" link, retire `/dashboard` (delete; post-auth redirects to `/groups`), and `/auth/callback`'s post-exchange redirect changes from `/` to `/groups`. Verified by manual e2e flow on localhost and prod.

The PKCE OAuth flow from F-01 is the only authentication mechanism touched. No middleware changes. No new env vars. shadcn primitives added via the CLI (`card`, `input`, `label`).

## Critical Implementation Details

- **RLS recursion trap on `group_members`.** A naive policy like `USING (group_id IN (SELECT group_id FROM group_members WHERE user_id = auth.uid()))` on `group_members` itself recurses (the sub-SELECT triggers the same policy). The standard fix is a `SECURITY DEFINER` SQL function `is_group_member(g uuid) RETURNS boolean` that bypasses RLS for its inner read; policies then call the function rather than self-querying. This is the load-bearing trick that keeps the policy set both correct and readable.
- **Invite token uniqueness + regeneration semantics.** `invite_token` is `text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text`. Regenerate = `UPDATE groups SET invite_token = gen_random_uuid()::text WHERE id = $1 AND created_by = auth.uid()` (creator-only). Old token is now unbound to any row; any previously-shared link returns "invite not found". This IS the v1 revoke mechanism.
- **`/invite/[token]` is an `.astro` page, not an `/api/` endpoint.** Reason: the page has two render paths (authed → server-side INSERT + redirect; anonymous → render "Sign in to join" CTA). Both need access to `Astro.locals.user` and Astro's redirect mechanics. The page is server-rendered (Astro's `output: "server"` in `astro.config.mjs:12`); no client island needed.
- **OAuth `?next=` must be same-origin only.** When the OAuth-start route reads `next` from the form/query, validate by URL-parsing: `new URL(next, context.url.origin).origin === context.url.origin`. The naive `startsWith("/") && !startsWith("//")` heuristic misses backslash-prefix edge cases like `/\evil.com/foo` that some browser URL parsers normalize to `//evil.com/foo`. URL-parsing + origin equality is one extra line and rigorously closed. Same validation in `/auth/callback`.
- **Single Supabase project after Prerequisites.** Every subsequent migration, RLS policy, and Studio config change lands on `dchurjcpgzuoyunjsokl`. Future planning should NOT introduce a separate "dev" project unless there's a hard reason — the lessons.md rule chose consolidation deliberately.

## Prerequisites (operational — do before Phase 1)

Per `context/foundation/lessons.md` rule "Reconcile Marketplace-provisioned backend resources":

1. **Decommission the stale dev Supabase project** (`uldvnsbhztupwemzityg`):
   - Verify its only contents are test auth users (no domain rows would exist since `supabase/migrations/` is empty).
   - Either delete the project from the Supabase dashboard, or leave it abandoned (no further GameSlot changes touch it). Either is fine — the lesson rule cares about which project the *active code* uses, not whether the stale one is physically gone.
2. **Repoint local `.env` at the prod-bound project** (`dchurjcpgzuoyunjsokl`):
   - Run `vercel env pull .env` to overwrite `SUPABASE_URL` + `SUPABASE_ANON_KEY` with the prod-bound values. (Vercel CLI is whitelisted per `infrastructure.md` operational story.) Vercel's Development scope is intentionally empty per `deploy-plan.md` step 7, so use `vercel env pull --environment=preview .env` or the production scope.
3. **Restart `npm run dev`** and verify localhost Google sign-in still works (you'll authenticate against the prod-bound project's auth tenant now; if you have an existing local user, you'll see it in Supabase Studio Auth → Users for `dchurjcpgzuoyunjsokl`).
4. **Update `.env.example`** to drop the "Used by `supabase start` only" framing — the project no longer maintains a separate local DB; the env file just contains the consolidated project's URL + anon key (and Google OAuth client/secret for completeness if `supabase start` is ever used).
5. **Wire `supabase` CLI for `db push`** (canonical migration-apply path, per plan-review F2 Fix B):
   - `npx supabase login` — interactive; opens browser to login.supabase.com → returns an access token written to `~/.supabase/access-token`.
   - `npx supabase link --project-ref dchurjcpgzuoyunjsokl` — writes the project ref locally so `db push` knows which remote DB to target.
   - Add `.supabase/` to `.gitignore` if not already present (the directory holds local state and tokens; should never be committed).

Verification gate before Phase 1: (a) localhost `/auth/signin` → Google round-trip → land on `/` signed in, **with the email shown matching the prod-bound project's auth tenant** (verify by opening Supabase Studio for `dchurjcpgzuoyunjsokl` → Authentication → Users); (b) `npx supabase status` (or equivalent) confirms the CLI is linked to `dchurjcpgzuoyunjsokl`.

## Phase 1: Schema + RLS migration

### Overview

Create the project's first migration with two domain tables, one helper SQL function, and six RLS policies. Apply it to the consolidated Supabase project. Verify the schema + policies exist via Supabase Studio.

### Changes Required:

#### 1. Migrations directory + first migration

**File**: `supabase/migrations/<timestamp>_groups_and_members.sql` (new — also creates the `supabase/migrations/` directory)

**Intent**: Land the `groups` + `group_members` schema, the `is_group_member()` security-definer helper, and the six RLS policies that enforce the PRD's privacy NFR ("a group's membership and its members' availability are visible only to members of that group"). Pattern downstream slices will copy.

**Contract**:

```sql
-- groups: one row per friend group, holds the single invite token
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  created_by  uuid not null references auth.users(id) on delete cascade,
  invite_token text not null unique default gen_random_uuid()::text,
  created_at  timestamptz not null default now()
);

-- group_members: composite-PK membership rows
create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- helper: avoid RLS recursion on group_members.
-- security definer so the inner SELECT bypasses the table's own policies.
create or replace function public.is_group_member(g uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid()
  );
$$;
revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

-- groups: SELECT if you're a member, INSERT if you set yourself as creator,
-- UPDATE only by creator (for invite_token regeneration / rename).
create policy "groups: members read"
  on public.groups for select to authenticated
  using (public.is_group_member(id));

create policy "groups: creator writes"
  on public.groups for insert to authenticated
  with check (created_by = auth.uid());

create policy "groups: creator updates"
  on public.groups for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- group_members: SELECT if you're a member of the same group,
-- INSERT only your own membership row, DELETE only your own row.
create policy "group_members: members read"
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_members: self join"
  on public.group_members for insert to authenticated
  with check (user_id = auth.uid());

create policy "group_members: self leave"
  on public.group_members for delete to authenticated
  using (user_id = auth.uid());
```

The `is_group_member()` function call inside the `groups` SELECT policy means: the user can see a group iff they're a member of it. For the `group_members` SELECT policy, the function gates on the SAME `group_id` being looked up — so members see all other members of any group they belong to, but no other rows.

#### 2. Apply migration to the consolidated Supabase project

**File**: (external — `npx supabase db push` against the project linked in Prerequisites step 5)

**Intent**: Land the migration on the prod-bound project. `supabase/migrations/<timestamp>_groups_and_members.sql` is the source of truth; `supabase db push` is the canonical apply path (per plan-review F2 Fix B — gives apply-tracking via the hosted `supabase_migrations.schema_migrations` table and scales to multi-developer if needed later). Studio SQL editor remains as an emergency override, not the convention.

**Contract**: `npx supabase db push` from the project root. The CLI authenticates via the access token from Prerequisites step 5, locates the linked project ref (`dchurjcpgzuoyunjsokl`), and applies any unapplied migration files in `supabase/migrations/` (timestamped lexically). After apply, the four objects exist in `public`: `groups`, `group_members`, `is_group_member`, and six policies; the hosted `supabase_migrations.schema_migrations` row for this migration's timestamp is present.

### Success Criteria:

#### Automated Verification:

- `ls supabase/migrations/*_groups_and_members.sql` returns the file
- `npm run lint` passes
- `npm run typecheck` passes
- `npm run build` passes

#### Manual Verification:

- Supabase Studio for `dchurjcpgzuoyunjsokl` → Database → Tables shows `public.groups` and `public.group_members` with the expected columns + types + constraints
- Studio → Authentication → Policies shows the six policies on the two tables
- Studio → SQL Editor: `select public.is_group_member('00000000-0000-0000-0000-000000000000'::uuid)` runs and returns `false` (function exists, callable as authenticated user via Studio's anon role does NOT apply — just checking it compiled)
- Manual smoke from Studio SQL editor: as auth user A (Studio "Impersonate user"), `INSERT INTO groups (name, created_by) VALUES ('test', auth.uid())` succeeds; selecting from `groups` returns 0 rows because A is not yet in `group_members`. Then `INSERT INTO group_members (group_id, user_id) VALUES (<the new id>, auth.uid())` succeeds; subsequent `SELECT * FROM groups` returns the row. Cleanup: `DELETE FROM groups WHERE name = 'test'`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual Studio verification succeeded before proceeding to Phase 2.

---

## Phase 2: Server endpoints + OAuth `?next=` extension

### Overview

Add the three groups endpoints, the `/invite/[token]` page handler, and a 2-call-site extension to the existing OAuth round-trip so an unauthed visitor to `/invite/<token>` can sign in and land back at the same URL.

### Changes Required:

#### 1. Create-group endpoint

**File**: `src/pages/api/groups/index.ts` (new)

**Intent**: Server endpoint that creates a group (with creator as `created_by`) and inserts the creator into `group_members` in one round-trip. POSTs from `/groups/new`'s form land here.

**Contract**: Exports `POST: APIRoute`. Reads `name` from `await context.request.formData()`. Validates `name.trim().length > 0` (defensive — DB has the same `check`). Gets `supabase` via the existing `createClient(context.request.headers, context.cookies)` factory at `src/lib/supabase.ts:5`. Inserts into `groups` (returning `id`), then into `group_members` with the new `id` + `auth.uid()`. On success: `context.redirect(`/groups/${id}`)`. On any error: redirect to `/groups/new?error=...` with `encodeURIComponent`. Matches the null-client guard pattern from `src/pages/api/auth/oauth/google.ts:6`.

#### 2. Regenerate-invite endpoint

**File**: `src/pages/api/groups/[id]/regenerate-invite.ts` (new)

**Intent**: Creator regenerates the group's invite token, invalidating any previously-shared link.

**Contract**: Exports `POST: APIRoute`. Reads `id` from `context.params`. `UPDATE groups SET invite_token = gen_random_uuid()::text WHERE id = $1` — RLS policy "groups: creator updates" enforces creator-only access; non-creators get 0 rows updated. On success: `context.redirect(`/groups/${id}`)`. On error or 0-rows-updated: `context.redirect(`/groups/${id}?error=...`)`.

#### 3. Invite-acceptance page

**File**: `src/pages/invite/[token].astro` (new)

**Intent**: Lookup the group by `invite_token`; if visitor is authed, insert them into `group_members` (idempotent — composite PK + `ON CONFLICT DO NOTHING` semantics) and redirect to the group page; if anonymous, render a sign-in CTA that round-trips back to this exact URL after OAuth.

**Contract**: Astro page (no API endpoint export). Renders server-side: reads `token` from `Astro.params`, queries `groups` by `invite_token` using the `SUPABASE_SERVICE_ROLE_KEY` client (RLS would otherwise prevent an anonymous reader — we need to know if the token exists before sending the user through OAuth). If no group found, render a "Invite not found or expired" message. If found AND `Astro.locals.user` is set, `INSERT INTO group_members (group_id, user_id) VALUES ($1, auth.uid()) ON CONFLICT DO NOTHING` (RLS check passes because `user_id = auth.uid()` per the "self join" policy), then `Astro.redirect(`/groups/${groupId}`, 302)`. If found AND user is anonymous, render a sign-in CTA: `<form method="POST" action="/api/auth/oauth/google"><input type="hidden" name="next" value={`/invite/${token}`}><button>Continue with Google to join "{group.name}"</button></form>`. Reuses the alert-card styling from `src/pages/auth/signin.astro:17-25` for error messaging.

The service-role client used for the *lookup* is a new server-only path; create it as `src/lib/supabase-admin.ts` (or extend `src/lib/supabase.ts`) wrapping `createServerClient` with `SUPABASE_SERVICE_ROLE_KEY` instead of the anon key. Service-role keys bypass RLS — use this lookup function for nothing other than "does this invite token exist; if so, return `(group_id, group_name)`". The actual membership INSERT goes through the normal user-scoped client so RLS still enforces `user_id = auth.uid()`.

#### 4. Admin Supabase client factory

**File**: `src/lib/supabase-admin.ts` (new)

**Intent**: A second factory that uses the service-role key instead of the anon key, for the narrow case where we need to bypass RLS (invite-token lookup). Lives alongside `src/lib/supabase.ts` and shares no state.

**Contract**: Exports `createAdminClient()` returning a `SupabaseClient` (NOT the SSR variant — admin operations don't need cookie awareness). Uses `@supabase/supabase-js`'s `createClient` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Returns `null` if either env var is absent (graceful degradation matching `src/lib/supabase.ts:6`). Document with a 2-line comment that this client bypasses RLS and must be used sparingly.

#### 5. Add SUPABASE_SERVICE_ROLE_KEY to astro env schema

**File**: `astro.config.mjs`

**Intent**: The env schema at `astro.config.mjs:18` already lists `SUPABASE_SERVICE_ROLE_KEY` as `optional: true` — so this change is just making sure the consumer (`supabase-admin.ts`) handles the `undefined` case gracefully. No schema edit required if it's already there.

**Contract**: Verify the existing schema. No code change unless missing.

#### 6. OAuth-start route — accept `next` param

**File**: `src/pages/api/auth/oauth/google.ts`

**Intent**: Extend the existing route to read an optional `next` param from the POST form and thread it through Supabase's `redirectTo` query string. Same-origin-path validation prevents open redirect.

**Contract**: After the existing `formData` read, extract `next` (string | null). Validate via URL parsing: `next` is valid iff `new URL(next, context.url.origin).origin === context.url.origin`; otherwise drop it (see Critical Implementation Details for why URL-parsing beats the `startsWith` heuristic). When building `redirectTo` at line 11, append `?next=${encodeURIComponent(next)}` if `next` survived validation. The existing 302 redirect to `data.url` is unchanged — Supabase echoes our `redirectTo` back, so the `next` arrives at `/auth/callback`.

#### 7. Callback route — honor `next` param

**File**: `src/pages/auth/callback.ts`

**Intent**: After `exchangeCodeForSession` succeeds, redirect to `next` instead of `/` when present and same-origin-valid.

**Contract**: After successful exchange (line 21–24), read `next` from `context.url.searchParams`. Apply the same URL-parsing same-origin validation as in change #6 (`new URL(next, context.url.origin).origin === context.url.origin`). If valid, `context.redirect(next, 302)`. Otherwise the existing `context.redirect("/", 302)` (which we'll change to `/groups` in Phase 3 — leave at `/` here so this phase doesn't bundle the post-auth-landing change).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run typecheck` passes
- `npm run build` passes
- All five new/modified files exist: `src/pages/api/groups/index.ts`, `src/pages/api/groups/[id]/regenerate-invite.ts`, `src/pages/invite/[token].astro`, `src/lib/supabase-admin.ts`, and the diffs in `src/pages/api/auth/oauth/google.ts` + `src/pages/auth/callback.ts`

#### Manual Verification:

- Sign in on localhost. From Studio SQL editor, create a test group as your user (or use the Phase 1 manual smoke leftover). Note the `invite_token`.
- Visit `http://localhost:4321/invite/<token>` as the **same** signed-in user → lands on `/groups/<id>` (membership row inserted; verify in Studio `group_members` table). Re-visit the same URL → still lands cleanly (no duplicate row due to `ON CONFLICT DO NOTHING`).
- Sign out. Visit the invite link anonymously → see "Continue with Google to join '<group name>'" CTA. Click → OAuth round-trip → land back on `/invite/<token>` signed in → lands on `/groups/<id>` with new membership row.
- `curl -X POST http://localhost:4321/api/auth/oauth/google -d 'next=https://evil.example.com'` → Supabase redirect URL does NOT contain `evil.example.com` (open-redirect validation works).
- Query-string-merge verification (per lessons.md rule #1 — "verify integration auto-sync claims empirically"): during the anonymous-invite OAuth round-trip from the previous bullet, inspect the URL the browser lands on after Google consent. It MUST contain BOTH `next=/invite/<token>` AND `code=<…>` as distinct query parameters joined by `&` (i.e. `…/auth/callback?next=…&code=…&type=…`). If Supabase returns a malformed URL (`?next=…?code=…`) or drops `next` entirely, the `?next=` thread-through is broken — fall back to a short-lived cookie-based hand-off: set a 5-min `pending_invite_token=<token>` cookie in `/api/auth/oauth/google`, read + clear it in `/auth/callback`, redirect to `/invite/<token>` if set. The fallback path stays out of code until/unless this verification fails.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: UI pages + nav update

### Overview

Add the four pages that surface the schema and endpoints to users, update the Topbar to expose the "Groups" entry point, retire `/dashboard`, and change the post-auth landing page from `/` to `/groups`. After this phase the full S-01 round-trip works end-to-end via the browser.

### Changes Required:

#### 1. shadcn primitives

**File**: (CLI command, runs `npx shadcn@latest add card input label`)

**Intent**: Install the three shadcn components the new pages depend on. Currently only `button.tsx` is in `src/components/ui/`.

**Contract**: After running the command, `src/components/ui/{card,input,label}.tsx` exist. No other code change.

#### 2. Groups list page

**File**: `src/pages/groups/index.astro` (new)

**Intent**: Show the signed-in user's groups (name + member count) with a "New group" CTA. Empty state shows just the CTA.

**Contract**: Astro page. Reads `Astro.locals.user`; redirects to `/auth/signin?error=Please+sign+in` if anonymous. Queries `SELECT g.id, g.name, count(gm2.user_id) as member_count FROM groups g JOIN group_members gm ON gm.group_id = g.id LEFT JOIN group_members gm2 ON gm2.group_id = g.id WHERE gm.user_id = auth.uid() GROUP BY g.id ORDER BY g.created_at DESC` via the authed Supabase client (RLS handles the `WHERE gm.user_id = auth.uid()` implicitly — you only see groups you're a member of). Renders each as a `<Card>` linking to `/groups/<id>`. Includes a "New group" button linking to `/groups/new`. Empty state copy: "You're not in any groups yet. Create one and invite friends."

#### 3. Create-group form page

**File**: `src/pages/groups/new.astro` (new)

**Intent**: Form to create a new group. Single text input (name), submit button.

**Contract**: Astro page. Anonymous-user guard (redirect to `/auth/signin`). Form: `<form method="POST" action="/api/groups"><input name="name" required /><button>Create</button></form>` styled with shadcn primitives. Inline error display for `?error=...` mirroring the pattern from `src/pages/auth/signin.astro:17-25`.

#### 4. Group detail page

**File**: `src/pages/groups/[id].astro` (new)

**Intent**: Show the group's name, member list (just emails or display names from `auth.users`), the current invite link (full URL with origin), a "Copy link" affordance, and (for the creator) a "Regenerate invite" button.

**Contract**: Astro page. Anonymous-user guard. Reads `id` from `Astro.params`. Queries `groups` by `id` — returns 0 rows if user isn't a member (RLS); render "Group not found" in that case (do not distinguish "doesn't exist" from "you're not a member" — privacy NFR). Also queries `group_members` joined to `auth.users` for the emails. Computes `inviteUrl = ${Astro.url.origin}/invite/${group.invite_token}`. Renders: heading with group name, member list, invite-link `<input readonly value={inviteUrl}>` + a copy-to-clipboard button (small client-side `<script>` calling `navigator.clipboard.writeText` — single line, no React island needed). If `group.created_by === Astro.locals.user.id`, render a `<form method="POST" action={`/api/groups/${id}/regenerate-invite`}>` with a "Regenerate invite link" button below the input.

The `auth.users` join requires the service-role client (the anon role has no access to `auth.users`). Use `createAdminClient()` from `src/lib/supabase-admin.ts` to fetch the emails, scoped to just the user_ids returned from `group_members`. This is the second deliberate use of the admin client — keep it narrow.

#### 5. Topbar — add Groups link when authed

**File**: `src/components/Topbar.astro`

**Intent**: When `user` is set, show a "Groups" link before the "Dashboard" link (which is about to be retired in change #7 of this phase but `Topbar` should be updated to reflect the new home regardless).

**Contract**: In the authed branch at lines 8–22, replace the "Dashboard" link with a "Groups" link pointing at `/groups`. Drop the Dashboard link entirely. Keep the email span and sign-out form.

#### 6. Post-auth landing — change to `/groups`

**File**: `src/pages/auth/callback.ts`

**Intent**: When OAuth completes WITHOUT a `next` param, send the user to their groups list (the natural home) instead of `/`.

**Contract**: Change the default success redirect from `context.redirect("/", 302)` to `context.redirect("/groups", 302)`. The `next`-honoring branch added in Phase 2 still takes precedence when present.

#### 7. Retire `/dashboard`

**File**: `src/pages/dashboard.astro` (delete)

**Intent**: With `/groups` as the post-auth home, the placeholder dashboard is redundant. Delete it to keep the auth surface honest.

**Contract**: `git rm src/pages/dashboard.astro`. Update `PROTECTED_ROUTES` in `src/middleware.ts:4` from `["/dashboard"]` to `["/groups"]`. The single entry matches `/groups`, `/groups/new`, AND `/groups/<id>` because the middleware uses `pathname.startsWith(route)` at line 18. The `/invite/[token]` route is intentionally NOT in `PROTECTED_ROUTES` — anonymous visitors are supposed to land there and see the sign-in CTA.

_(Removed during plan-review F5: an `index.astro` / `Welcome.astro` authed-CTA refresh was originally listed here as "optional polish". Dropped from Phase 3 scope under `top_blocker = time`. The hero's Sign In / Sign Up buttons remain harmless for authed users — clicking lands them on `/auth/signin` which bounces them back via the post-auth redirect. Topbar already exposes the `/groups` entry point. Re-add as a follow-up change if user feedback demands it.)_

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run typecheck` passes
- `npm run build` passes
- `src/components/ui/{card,input,label}.tsx` exist
- `src/pages/groups/{index,new,[id]}.astro` exist
- `src/pages/dashboard.astro` does NOT exist
- `src/middleware.ts` `PROTECTED_ROUTES` includes `/groups`

#### Manual Verification (the v1 happy path):

- Sign in fresh on localhost → land on `/groups` (NOT `/`, NOT `/dashboard`).
- Click "New group", enter "Test Crew", submit → land on `/groups/<id>` with you as the only member and an invite link displayed; copy the invite link to the clipboard.
- Open an incognito browser; paste the invite URL → see "Sign in to join 'Test Crew'" page → click "Continue with Google" → consent with a different Google account (F-01 verified multi-account swap works) → land back on `/groups/<id>` as the new user; member count = 2.
- Switch back to the first session's browser, reload `/groups/<id>` → see two members (no real-time, manual refresh expected per "Not Doing").
- As the creator (first user), click "Regenerate invite link" → page reloads with a different invite URL. Try the previous URL in incognito (signed-in second user) → "Invite not found".
- Topbar shows "Groups" link instead of "Dashboard". Navigating to `/dashboard` returns 404.
- Sign out → `/groups` redirects back to `/auth/signin`.
- RLS sanity (browser path): from a second Google account NOT invited to the group, navigate to `/groups/<original-group-id>` directly → 404 / "Group not found". (Lifted from Testing Strategy → Manual Testing Steps #4 so RLS validation has a Phase-3 success-criterion home.)
- RLS sanity (REST path — the rigorous test): while signed in as the NOT-INVITED second user, extract the access JWT from the `sb-<project-ref>-auth-token` cookie (DevTools → Application → Cookies; the cookie value is a JSON array; the JWT is `[0]`'s `access_token` field). Then `curl 'https://dchurjcpgzuoyunjsokl.supabase.co/rest/v1/groups?id=eq.<original-group-id>' -H "apikey: <SUPABASE_ANON_KEY from .env>" -H "Authorization: Bearer <extracted JWT>"` → returns `[]`. This validates the actual REST/RLS boundary, not the app's 404 projection of it. If the response is anything other than `[]`, RLS is misconfigured.
- Repeat the prod end-to-end after deploying via `git push`. Tag the prod deploy `prod-2026-MM-DD-1` per `infrastructure.md` rollback discipline.

**Implementation Note**: After Phase 3's manual verification passes on **both localhost and prod**, the slice is complete.

---

## Testing Strategy

### Unit Tests:

- None. Repo has no test runner (verified — `package.json` scripts are `dev/build/lint/typecheck/format` only). Adding a runner + tests is its own change; out of scope per "What We're NOT Doing".

### Integration Tests:

- None mechanized.

### Manual Testing Steps:

1. Phase 1: SQL Editor smoke (create, member-insert, SELECT visibility, cleanup) as described.
2. Phase 2: localhost curl + browser invite-acceptance round-trip for both authed and anonymous visitor states.
3. Phase 3: the full v1 happy path on localhost and prod (described in Phase 3 manual verification).
4. RLS sanity: with two Google accounts A and B, A creates a group; B is NOT invited; B opens `/groups/<A's group id>` directly → 404 / "not found". B has not received an invite link — RLS blocks the read.
5. Invite-link revoke sanity: A regenerates token; the previously-shared link returns "invite not found" when B re-opens it.

## Performance Considerations

At friend-group scale (~5–10 users per group, 1 group MVP), every query is single-row or bounded by member count. No pagination, no indexes beyond the PKs / FK indexes Postgres creates by default + the `invite_token` UNIQUE index. The `is_group_member()` helper is `STABLE`, allowing PostgreSQL to cache its result within a query. Fits comfortably inside Vercel's default function budget; no `maxDuration` override needed.

## Migration Notes

This is the project's first migration. Going forward:

- Migration filename convention: `<timestamp>_<snake_case_description>.sql`. The Supabase CLI uses ISO timestamp prefixes (`20260601120000_groups_and_members.sql`); pick the timestamp at file-creation time.
- All migrations land on the consolidated project (`dchurjcpgzuoyunjsokl`) only. Per the Prerequisites consolidation, no separate dev project.
- Rollback: if Phase 1's migration has a problem, drop the two tables + helper function in a reverse-order SQL script (`drop function is_group_member; drop table group_members; drop table groups;`) — both tables are empty at first apply, so no data loss. Subsequent migrations should ship a rollback script alongside if they touch existing data.

## References

- Change identity: `context/changes/create-group-and-invite/change.md`
- Roadmap entry: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-002, FR-003, FR-004, US-01 Given clause, §Access Control, §Privacy NFR)
- Shape notes: `context/foundation/shape-notes.md`
- Lessons priors: `context/foundation/lessons.md` (rules #1 — verify integration claims, #2 — reconcile dual backend resources)
- Prior F-01 patterns:
  - SSR client factory (reuse): `src/lib/supabase.ts:5`
  - Server endpoint with null-client guard + redirect-with-error: `src/pages/api/auth/oauth/google.ts:6`
  - Middleware user population + protected-route gate: `src/middleware.ts:6`
  - PKCE callback + cookie-set side effect: `src/pages/auth/callback.ts:1`
  - Topbar pattern: `src/components/Topbar.astro:7`
  - Inline error alert (no React island): `src/pages/auth/signin.astro:17-25`
- F-01 archived for context: `context/archive/2026-05-27-google-oauth-signin/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema + RLS migration

#### Automated

- [x] 1.1 `ls supabase/migrations/*_groups_and_members.sql` returns the file
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run typecheck` passes
- [x] 1.4 `npm run build` passes

#### Manual

- [x] 1.5 Supabase Studio for `dchurjcpgzuoyunjsokl` → Database → Tables shows `public.groups` and `public.group_members` with the expected columns + types + constraints
- [x] 1.6 Studio → Authentication → Policies shows the six policies on the two tables
- [x] 1.7 Studio SQL editor: `select public.is_group_member('00000000-0000-0000-0000-000000000000'::uuid)` returns `false`
- [x] 1.8 SQL editor smoke: insert a test group + self-membership row as an authed user; verify SELECT returns the row; cleanup. **Adapted at impl time**: Studio's SQL editor runs as the `postgres` superuser, so `auth.uid()` returns NULL. Inserting with `auth.uid()` triggered `null value in column "created_by" violates not-null constraint` — POSITIVE signal that the NOT NULL constraint fires. Full RLS-correctness verification deferred to Phase 3 manual 3.15 (browser path) + 3.16 (REST-curl path), where real authenticated users hit the policies.

### Phase 2: Server endpoints + OAuth `?next=` extension

#### Automated

- [ ] 2.1 `npm run lint` passes
- [ ] 2.2 `npm run typecheck` passes
- [ ] 2.3 `npm run build` passes
- [ ] 2.4 All five new/modified files exist (`src/pages/api/groups/index.ts`, `src/pages/api/groups/[id]/regenerate-invite.ts`, `src/pages/invite/[token].astro`, `src/lib/supabase-admin.ts`, plus diffs in `src/pages/api/auth/oauth/google.ts` + `src/pages/auth/callback.ts`)

#### Manual

- [ ] 2.5 Sign in on localhost; create a test group via SQL editor (or leave from Phase 1); note `invite_token`
- [ ] 2.6 Visit `/invite/<token>` as the same signed-in user → land on `/groups/<id>`; idempotent on re-visit
- [ ] 2.7 Sign out; visit invite link anonymously → see "Continue with Google to join '<name>'" CTA; OAuth round-trip returns to `/invite/<token>` then `/groups/<id>` signed in
- [ ] 2.8 `curl -X POST localhost:4321/api/auth/oauth/google -d 'next=https://evil.example.com'` → Supabase redirect URL does NOT contain `evil.example.com` (open-redirect validation)
- [ ] 2.9 Query-string-merge verification (lessons.md rule #1): during the anonymous-invite OAuth round-trip from 2.7, inspect the URL the browser lands on after Google consent. It MUST contain BOTH `next=/invite/<token>` AND `code=<…>` as distinct query parameters joined by `&` (e.g. `?next=…&code=…&type=…`). If Supabase mishandles the merge (`?next=…?code=…` or `next` missing), the `?next=` thread-through is broken — fall back to a short-lived cookie-based hand-off (set `pending_invite_token=<token>` cookie in `/api/auth/oauth/google` for ~5 min, read + clear it in `/auth/callback`, redirect to `/invite/<token>` if set). The fallback path stays out of code until/unless this verification fails.

### Phase 3: UI pages + nav update

#### Automated

- [ ] 3.1 `npm run lint` passes
- [ ] 3.2 `npm run typecheck` passes
- [ ] 3.3 `npm run build` passes
- [ ] 3.4 `src/components/ui/{card,input,label}.tsx` exist
- [ ] 3.5 `src/pages/groups/{index,new,[id]}.astro` exist
- [ ] 3.6 `src/pages/dashboard.astro` does NOT exist
- [ ] 3.7 `src/middleware.ts` `PROTECTED_ROUTES` includes `/groups`

#### Manual

- [ ] 3.8 Sign in fresh → land on `/groups` (not `/`, not `/dashboard`)
- [ ] 3.9 Create "Test Crew" via `/groups/new` → land on `/groups/<id>` with one member, invite link displayed; copy the invite link to the clipboard
- [ ] 3.10 Open invite URL in incognito → "Continue with Google to join 'Test Crew'" → consent with a different Google account → land on `/groups/<id>` as the new member; member count = 2
- [ ] 3.11 Reload from creator's session → see two members
- [ ] 3.12 Regenerate invite (as creator) → previous URL returns "Invite not found" in incognito
- [ ] 3.13 Topbar shows "Groups" link; `/dashboard` returns 404
- [ ] 3.14 Sign out from `/groups` → redirects to `/auth/signin`
- [ ] 3.15 RLS sanity (browser path): from a second Google account NOT invited, navigating to `/groups/<id>` directly returns 404 / "Group not found"
- [ ] 3.16 RLS sanity (REST path): curl Supabase `/rest/v1/groups?id=eq.<id>` with the second user's JWT + anon-key headers → returns `[]` (validates the actual RLS boundary, not the app's 404 projection)
- [ ] 3.17 Repeat happy path on prod (`https://10xdevs-lilac.vercel.app`); tag prod deploy `prod-2026-MM-DD-1`
