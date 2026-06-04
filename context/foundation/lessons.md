# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Verify integration auto-sync claims empirically before treating them as load-bearing

**Context**: Selecting/recommending a hosting platform based on a Marketplace integration's claimed behavior (e.g., Vercel–Supabase OAuth redirect-URI auto-sync) during /10x-infra-research, /10x-tech-stack-selector, or /10x-plan for any auth/OAuth feature.

**Problem**: `context/foundation/infrastructure.md` treated the Vercel–Supabase integration's preview redirect-URI auto-sync as the platform differentiator justifying Vercel over Cloudflare Workers. `context/foundation/deploy-plan.md` Phase 3 step 13 deferred verification "to FR-001". When FR-001 actually exercised the flow, the auto-sync was empirically not happening — preview deploys silently fell back to Site URL with the OAuth code landing on `/` (no `/auth/callback` exchange = no session). A manual wildcard `https://**.vercel.app/auth/callback` in Supabase's Redirect URLs was required. Had the infra recommendation depended *solely* on this feature, the platform pick would have been wrong.

**Rule**: When a Marketplace / integration / platform claim is load-bearing in /10x-infra-research, /10x-tech-stack-selector, or any /10x-plan touching that surface, list it explicitly as an **unverified prior** and either (a) verify it before deciding, or (b) include a verification step in the next change that exercises it, with a follow-up rule to update the source doc if the claim turns out false. Don't let "the integration handles X" sit as silent gospel.

**Applies to**: research, plan, plan-review, implement, impl-review

## Verify PostgREST honors `auth.uid()` before relying on RLS as the auth gate on Supabase projects

**Context**: Any `/10x-plan` for a feature that relies on Postgres RLS policies of the form `to authenticated using/with check (col = auth.uid())` to gate user-scoped reads or writes. Triggered by Supabase projects on the asymmetric JWT signing format (ECC P-256 / ES256 access tokens, `sb_publishable_*` / `sb_secret_*` API keys). The Vercel–Supabase Marketplace integration provisions projects in this configuration by default as of mid-2026.

**Problem**: GameSlot's S-01 (create-group-and-invite) Phase 3.9 failed first-pass create-group with PostgreSQL error `42501 — new row violates row-level security policy for table "groups"`. Diagnostics showed: JWT correctly signed (sub/role/aud/iss/exp all valid), session loaded by the SSR client, cookies present, BOTH supabase-js's `.insert()` chain AND a direct `fetch` to PostgREST with explicit `Authorization: Bearer <token>` returned 403 RLS violation. Swapping legacy `SUPABASE_ANON_KEY` (HS256 JWT) for new-format `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_*) as the apikey produced the same 403. PostgREST in this project is rejecting (or silently ignoring) JWTs signed with the project's active ECC P-256 key — `auth.uid()` returns NULL inside RLS, so `col = auth.uid()` evaluates to `col = NULL` → policy denies. Earlier Phase 2 INSERTs against `group_members` LOOKED like they worked because they no-op'd via `ON CONFLICT DO NOTHING` against a row already inserted as the postgres superuser via Studio SQL editor — never genuinely exercised authenticated RLS. The Auth API code path (`supabase.auth.getUser()`) DOES validate JWTs correctly (different code path from PostgREST), so middleware sees the right `locals.user`. This is a platform-level issue, not application code.

**Rule**: In `/10x-plan` for any feature where RLS is named as the auth gate on a Supabase project, include a verification step BEFORE Phase-1 ships that exercises a *genuine* authenticated INSERT to an RLS-protected table (no `ON CONFLICT DO NOTHING` paths; no postgres-role seed rows already present). If that INSERT fails with `42501` while the JWT/session is valid, RLS is not a usable gate on this project — design the feature with service-role + middleware-verified `locals.user` as the operative auth gate, leaving RLS policies in the migration as defense-in-depth (any direct external REST call still gets denied because `auth.uid()` is NULL for those too). Document the choice and link this lesson. Revisit (revert to user-scoped client) if Supabase fixes project-level JWT validation. Same rule applies during `/10x-implement` Phase 1's verification ritual: the SQL-editor smoke runs as postgres, which bypasses RLS — Phase 1 cannot prove RLS works for authenticated users.

**Applies to**: plan, plan-review, implement, impl-review

## Reconcile Marketplace-provisioned backend resources with any pre-existing local .env at first use

**Context**: Any project that uses a Vercel Marketplace (or similar PaaS) integration to provision a managed backend (Supabase, Neon, Upstash, Clerk, etc.) AND has a pre-existing local `.env` (or dev resource) for the same service. Surfaces during /10x-bootstrapper, /10x-implement of any auth/data-touching change, and after `vercel env pull`.

**Problem**: GameSlot's local `.env` pointed at Supabase project `uldvnsbhztupwemzityg` (manually created earlier). The Vercel–Supabase Marketplace integration provisioned a SEPARATE project `dchurjcpgzuoyunjsokl` and bound it to the Vercel project. Both produced working dev/prod environments, but they were completely separate Supabase tenants (different DB, different auth users). The mismatch only surfaced when FR-001's OAuth test on production hit a different Supabase auth URL than dev. Worse: the prod-bound project required Vercel → Storage → "Open in Supabase" to reach its Studio at all (no direct login access). Configuring the OAuth provider on the wrong project for ~30 min was the symptom.

**Rule**: When a Marketplace integration is installed and the repo also has a pre-existing `.env` for the same service, do an explicit *resource identity reconciliation* before relying on either: log the resource URL/ID from `.env`, log the URL/ID Vercel injects (`vercel env pull` to a temp file + diff), and either (a) point local `.env` at the Vercel-bound resource (delete the stale one) or (b) document the two-resource setup explicitly in `infrastructure.md` / `deploy-plan.md`. Any /10x-plan touching an integration-bound service surface must call out *which* resource — dev's, prod's, or both — and verify access to each.

**Applies to**: research, plan, plan-review, implement, impl-review

## Apply Supabase migrations via the CLI, never the Studio SQL editor on this project

**Context**: Any `/10x-plan` step that introduces a SQL migration on this Supabase project (`dchurjcpgzuoyunjsokl`, the Vercel-bound, asymmetric-JWT project), OR any `/10x-implement` step that needs to apply a migration to the linked remote. Triggered by both S-01's plan and S-02 v1's plan defaulting to "apply via Supabase Studio SQL editor" in their Phase 1 Manual Verification — corrected mid-implement on 2026-06-04.

**Problem**: Studio paste decouples the local `supabase/migrations/` directory from remote state — the CLI no longer knows whether a migration listed locally has been applied remotely, `npx supabase db diff --linked` reports phantom drift, and any future `npx supabase migration up` or `db push` either fails ("already exists") or duplicates work. It also breaks the contract a tracked migration directory is supposed to give: that `git log -- supabase/migrations/` is the audit trail of what was applied. The project is linked (`supabase/.temp/linked-project.json` present, `project-ref` = `dchurjcpgzuoyunjsokl`); the CLI is in devDeps; there is no reason to paste into Studio.

**Rule**: For schema migrations on this Supabase project, apply via `npx supabase db push --linked` (or `npx supabase migration up --linked` once the migration is reconciled). Never paste migration SQL into the Studio SQL editor. Plan Phase verification steps must say "apply via CLI" and include the exact command. Studio is reserved for read-only inspection (`\d`, `SELECT`, RLS-as-anon smoke tests) and for one-off **smoke test** writes that are explicitly rolled back — never for landing migrations.

**Applies to**: plan, plan-review, implement, impl-review
