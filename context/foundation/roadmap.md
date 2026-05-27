---
project: GameSlot
version: 1
status: draft
created: 2026-05-27
updated: 2026-05-27
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: GameSlot

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

GameSlot is a single, shared, lightweight calendar for one friend group: members mark availability, the calendar surfaces overlap at a glance, a host picks a slot and confirms it, and the group is push-notified — replacing the chat-thread / group-poll / DM coordination that today causes board-game sessions to be scheduled badly or skipped entirely. The **wedge** — the one trait that, if removed, makes GameSlot indistinguishable from a generic group-poll tool — is the overlap-surfacing rule that turns marked availability into a per-slot ranking the host acts on (PRD §Business Logic, FR-008). v1 targets one real friend group as the validation user; broader scope is parked.

## North star

**S-03: Host confirms session and group is push-notified** — when one real friend group runs this end-to-end loop and the session actually happens, the wedge is validated and the chat thread didn't have to exist. The **north star** here means the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works. PRD Success Criterion #1 step 6 is the literal definition: "every group member receives a notification that the session is confirmed."

## At a glance

| ID    | Change ID                              | Outcome (user can …)                                                | Prerequisites | PRD refs                              | Status   |
| ----- | -------------------------------------- | ------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| F-01  | google-oauth-signin                    | (foundation) Sign in via Google OAuth                               | —             | FR-001, Access Control                | ready    |
| F-02  | pwa-shell-and-push-delivery            | (foundation) PWA installs; push delivered via web-push              | —             | NFR §PWA, FR-012 (delivery path)      | ready    |
| S-01  | create-group-and-invite                | Create a friend group and bring members in via an invite link       | F-01          | FR-002, FR-003, FR-004, US-01         | proposed |
| S-02  | mark-availability-with-overlap         | Mark availability and see who else is free, with overlap surfaced   | S-01          | FR-005, FR-006, FR-007, FR-008, US-01 | proposed |
| S-03  | confirm-session-with-push-notification | Confirm a session at an overlapping slot and notify the whole group | S-02, F-02    | FR-009, FR-010, FR-011, FR-012, US-01 | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks. With `top_blocker = time` and a solo dev, "parallel" means "can be picked up out of order if the previous chunk's design isn't fully nailed," not literal concurrency.

| Stream | Theme                              | Chain                                  | Note                                                                                        |
| ------ | ---------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| A      | Member-facing core loop            | `F-01` → `S-01` → `S-02` → `S-03`      | Carries the north star at the end; sequenced under `main_goal = market-feedback`.           |
| B      | PWA + push delivery infrastructure | `F-02` → joins Stream A at `S-03`      | Highest implementation-risk foundation (per tech-stack.md); start in parallel with Stream A. |

## Baseline

What's already in place in the codebase as of `2026-05-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — per tech-stack.md (Astro 6 + React 19 + Tailwind 4 + shadcn). Verified live in prod this session at `https://10xdevs-lilac.vercel.app`.
- **Backend / API:** present — per tech-stack.md (Astro server endpoints). Auth routes exist at `src/pages/api/auth/{signin,signup,signout}.ts`.
- **Data:** partial — `@supabase/ssr` + `@supabase/supabase-js` wired in `src/lib/supabase.ts`; `supabase/migrations/` is empty (only `config.toml`). No domain tables (groups / availability / sessions / members).
- **Auth:** partial — Supabase email/password scaffold present (`src/pages/auth/{signin,signup,confirm-email}.astro`); Google OAuth (FR-001) deferred per `deploy-plan.md` Phase 2 step 10. `[auth.external.google]` block in `supabase/config.toml` is ready for `env()` substitution; no credentials yet, no `signInWithOAuth` call in the codebase.
- **Deploy / infra:** present — Vercel + GitHub auto-deploy verified end-to-end this session (push to `main` → live in ~1 minute). Tags `prod-2026-05-27-1` / `-2` mark rollback targets.
- **Observability:** absent — no sentry/otel/pino/winston deps; no logger/error-tracking imports.
- **PWA + Web Push:** absent — no `@vite-pwa/astro`, no `web-push`, no manifest, no service worker. Tech-stack.md explicitly flags this as manual post-scaffold work with no first-class JS-starter coverage.

## Foundations

### F-01: Google OAuth sign-in (FR-001)

- **Outcome:** (foundation) GameSlot users sign in via Google OAuth; `signInWithOAuth` is wired end-to-end across local dev, preview, and prod; the OAuth callback handler issues a Supabase session.
- **Change ID:** google-oauth-signin
- **PRD refs:** FR-001, §Access Control
- **Unlocks:** S-01, S-02, S-03 — every user-facing slice requires a signed-in member.
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Should the inherited starter's email/password auth scaffold be removed to match PRD's Google-only stance, or kept dormant? — Owner: user. Block: no (default = keep dormant; rip-out is scope-creep against `time` blocker).
- **Risk:** Small scope — most wiring exists from `deploy-plan.md` Phase 2 (config.toml block, env var schema, integration installed). The Google Cloud OAuth client creation is a manual human-only step inside this Foundation, not a separate Blocker. Critical path because every slice depends on a signed-in user.
- **Status:** ready

### F-02: PWA shell + Web Push delivery

- **Outcome:** (foundation) GameSlot is installable to a phone's home screen on Android and iOS (web app manifest + registered service worker); VAPID keys are generated and stored; the server can dispatch a Web Push message that the service worker receives and displays.
- **Change ID:** pwa-shell-and-push-delivery
- **PRD refs:** NFR §Progressive Web App, FR-012 (delivery path prerequisite)
- **Unlocks:** S-03 (north star) — without this Foundation, the closing-loop push step of US-01 cannot land.
- **Prerequisites:** —
- **Parallel with:** F-01, S-01, S-02
- **Blockers:** —
- **Unknowns:**
  - iOS Safari web push reliability (PRD FR-012 Socratic) — Owner: implementation. Block: no (work around quirks; instrument delivery).
- **Risk:** Highest implementation risk on the roadmap. Tech-stack.md explicitly calls this out as manual / first-class-in-no-starter; iOS Safari quirks are known time sinks against the `time` blocker. Starting F-02 in parallel with Stream A is the main hedge.
- **Status:** ready

## Slices

### S-01: Create a group and invite friends

- **Outcome:** A signed-in user can create a friend group, generate a shareable invite link for that group, and a different signed-in user who opens that link joins the group.
- **Change ID:** create-group-and-invite
- **PRD refs:** FR-002, FR-003, FR-004, US-01 (Given clause)
- **Prerequisites:** F-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Invite-link lifecycle — expiry / rotation / revoke (PRD Open Q #1). Owner: user. Block: no for v1 (single-group validation; revisit before any growth phase).
- **Risk:** Schema decisions for `groups` and `group_members` land here, including the privacy NFR's RLS posture. Get the RLS pattern right once because S-02 and S-03 will copy it for their tables.
- **Status:** proposed

### S-02: Mark availability with overlap surfacing

- **Outcome:** A group member can mark and unmark availability at day + start-hour granularity, and the calendar view shows per-slot availability counts with visual emphasis on slots above a meaningful threshold.
- **Change ID:** mark-availability-with-overlap
- **PRD refs:** FR-005, FR-006, FR-007, FR-008, US-01 (Given clause — overlapping availability)
- **Prerequisites:** S-01
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Post-confirm unmark semantics (PRD Open Q #2) — what happens if a member unmarks a slot at which a session has been confirmed? Owner: design/impl. Block: no (define behavior before FR-007 ships, but doesn't block planning).
  - "Meaningful threshold" for visual emphasis on overlap (PRD §Business Logic notes definition deferred to design). Owner: design. Block: no.
- **Risk:** FR-008 is the load-bearing FR per PRD's own Socratic: "the only FR doing real domain work; if it's wrong the rest is dressing." Overlap query correctness and the calendar visual are the wedge surface — the place to invest deeply.
- **Status:** proposed

### S-03: Confirm a session and notify the group

- **Outcome:** A group member picks an availability slot from the shared calendar, sets a free-text meeting location, and confirms the session (becoming its host); every group member receives a push notification with day, time, and location.
- **Change ID:** confirm-session-with-push-notification
- **PRD refs:** FR-009, FR-010, FR-011, FR-012, US-01 (Then clause)
- **Prerequisites:** S-02, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Push delivery fallback (PRD Open Q #3) — what if a user denied push permission or push fails? Owner: user. Block: no for v1 (acceptable to ship without fallback; first group's host can manually confirm receipt during validation).
  - Concurrency on simultaneous confirms (PRD FR-009 Socratic noted as acceptable risk at friend-group scale). Owner: implementation. Block: no.
- **Risk:** This is the **north star** — the validation milestone. Closes US-01 end-to-end. If push delivery degrades on iOS Safari, the feedback signal from the first real group degrades with it; instrumenting delivery (per-subscription success/failure log) is the cheapest hedge.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                              | Suggested issue title                                       | Ready for `/10x-plan` | Notes                                                                  |
| ---------- | -------------------------------------- | ----------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| F-01       | google-oauth-signin                    | Wire Google OAuth sign-in for GameSlot                      | yes                   | Includes Google Cloud client creation (manual step inside the change). |
| F-02       | pwa-shell-and-push-delivery            | Ship PWA shell + Web Push delivery foundation               | yes                   | Highest implementation risk; start in parallel with F-01.              |
| S-01       | create-group-and-invite                | Create a friend group with an invite link                   | no                    | Promotes to `ready` once F-01 lands.                                   |
| S-02       | mark-availability-with-overlap         | Mark availability and surface group overlap on the calendar | no                    | Promotes to `ready` once S-01 lands.                                   |
| S-03       | confirm-session-with-push-notification | Confirm a session at an overlapping slot and notify members | no                    | North star; promotes to `ready` once S-02 and F-02 both land.          |

## Open Roadmap Questions

1. **target_scale.qps ballpark.** Shape captured `users: small` (~5–10 per group) but never pinned a queries-per-second number. Owner: user. Block: roadmap-wide (no specific S-NN), not currently blocking — Supabase Free / Vercel Hobby comfortably absorb the implied range; revisit only if scope expands beyond one friend group.
2. **target_scale.data_volume ballpark.** Same as above for storage sizing. Owner: user. Block: no.
3. **Email/password scaffold disposition.** The 10x-astro-starter shipped a working email/password auth flow at `src/pages/auth/{signin,signup,confirm-email}.astro`; PRD §Access Control restricts v1 to Google OAuth only. Owner: user. Block: F-01 (decision shapes F-01's scope — default = keep dormant; rip-out is its own change against the `time` blocker).

## Parked

These are explicitly out of v1 scope. They will not sneak into any slice's scope.

- **No in-app chat / messaging.** — PRD §Non-Goals: GameSlot is a coordination calendar, not a communications tool.
- **No board-game library / recommendations.** — PRD §Non-Goals: v1 answers "when do we play?", not "what do we play?".
- **No external calendar integration (Google / Apple / iCal).** — PRD §Non-Goals: availability lives only in GameSlot.
- **No voting system for games or dates.** — PRD §Non-Goals: the host decides which slot becomes the session.
- **No public discovery / group search.** — PRD §Non-Goals: groups are invite-link-only.
- **No multi-time-zone support.** — PRD §Non-Goals: one group, one time zone.
- **No in-app notification inbox.** — PRD §Non-Goals + Open Question #4: push only for v1.
- **No "someone else is free then" overlap notification.** — PRD §Secondary Success Criteria: dropped during shaping (debounce / dedup risk for v1).
- **Observability beyond minimum delivery logging.** — Derived from `main_goal = market-feedback` + `top_blocker = time`: a single-group validation does not earn a Sentry/OTEL investment yet. Revisit if the wedge validates and broader rollout begins.
- **Email/password auth path enabled.** — PRD §Access Control restricts v1 to Google OAuth; the starter's scaffold is kept dormant (see Open Roadmap Question #3) but is not part of any v1 slice.

## Done

(Empty on first generation. `/10x-archive` appends here when a change whose `Change ID` matches a roadmap item is archived.)
