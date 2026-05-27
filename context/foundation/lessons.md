# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Verify integration auto-sync claims empirically before treating them as load-bearing

**Context**: Selecting/recommending a hosting platform based on a Marketplace integration's claimed behavior (e.g., Vercel–Supabase OAuth redirect-URI auto-sync) during /10x-infra-research, /10x-tech-stack-selector, or /10x-plan for any auth/OAuth feature.

**Problem**: `context/foundation/infrastructure.md` treated the Vercel–Supabase integration's preview redirect-URI auto-sync as the platform differentiator justifying Vercel over Cloudflare Workers. `context/foundation/deploy-plan.md` Phase 3 step 13 deferred verification "to FR-001". When FR-001 actually exercised the flow, the auto-sync was empirically not happening — preview deploys silently fell back to Site URL with the OAuth code landing on `/` (no `/auth/callback` exchange = no session). A manual wildcard `https://**.vercel.app/auth/callback` in Supabase's Redirect URLs was required. Had the infra recommendation depended *solely* on this feature, the platform pick would have been wrong.

**Rule**: When a Marketplace / integration / platform claim is load-bearing in /10x-infra-research, /10x-tech-stack-selector, or any /10x-plan touching that surface, list it explicitly as an **unverified prior** and either (a) verify it before deciding, or (b) include a verification step in the next change that exercises it, with a follow-up rule to update the source doc if the claim turns out false. Don't let "the integration handles X" sit as silent gospel.

**Applies to**: research, plan, plan-review, implement, impl-review

## Reconcile Marketplace-provisioned backend resources with any pre-existing local .env at first use

**Context**: Any project that uses a Vercel Marketplace (or similar PaaS) integration to provision a managed backend (Supabase, Neon, Upstash, Clerk, etc.) AND has a pre-existing local `.env` (or dev resource) for the same service. Surfaces during /10x-bootstrapper, /10x-implement of any auth/data-touching change, and after `vercel env pull`.

**Problem**: GameSlot's local `.env` pointed at Supabase project `uldvnsbhztupwemzityg` (manually created earlier). The Vercel–Supabase Marketplace integration provisioned a SEPARATE project `dchurjcpgzuoyunjsokl` and bound it to the Vercel project. Both produced working dev/prod environments, but they were completely separate Supabase tenants (different DB, different auth users). The mismatch only surfaced when FR-001's OAuth test on production hit a different Supabase auth URL than dev. Worse: the prod-bound project required Vercel → Storage → "Open in Supabase" to reach its Studio at all (no direct login access). Configuring the OAuth provider on the wrong project for ~30 min was the symptom.

**Rule**: When a Marketplace integration is installed and the repo also has a pre-existing `.env` for the same service, do an explicit *resource identity reconciliation* before relying on either: log the resource URL/ID from `.env`, log the URL/ID Vercel injects (`vercel env pull` to a temp file + diff), and either (a) point local `.env` at the Vercel-bound resource (delete the stale one) or (b) document the two-resource setup explicitly in `infrastructure.md` / `deploy-plan.md`. Any /10x-plan touching an integration-bound service surface must call out *which* resource — dev's, prod's, or both — and verify access to each.

**Applies to**: research, plan, plan-review, implement, impl-review
