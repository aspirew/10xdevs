# PWA Shell + Web Push Delivery — Plan Brief

> Full plan: `context/changes/pwa-shell-and-push-delivery/plan.md`

## What & Why

Deliver F-02 from the roadmap: turn GameSlot into an installable PWA on Android + iOS and prove a server → device Web Push round-trip end-to-end. This is the enabling foundation for S-03 (the north-star slice, "host confirms session → group is push-notified"). Ships all the plumbing S-03 needs so S-03 becomes purely a call-site change.

## Starting Point

Astro 6.3.1 SSR + Vercel adapter, React 19 islands, three Supabase migrations already applied, S-01 (group + invite) and S-02 (availability + overlap) are done and in production. Zero PWA surface today: no manifest, no service worker, no icons, no push code anywhere in `src/`. `Layout.astro` head is minimal (and has a broken viewport meta to fix in passing). Env vars declared via Astro's `envField` in `astro.config.mjs`. App-layer auth pattern established because PostgREST `auth.uid()` is broken on this project (lessons.md §2).

## Desired End State

A GameSlot user opens the app on their phone, installs it to the home screen following per-platform instructions on `/install`, launches the installed app, taps "Enable notifications," and taps "Send test notification" to prove a push arrives — even with the tab closed. The server exports a `sendPushToUser(admin, userId, payload)` helper that S-03 will import and call from its confirm-session endpoint. `push_subscriptions` table persists per-device rows keyed by endpoint; 410 responses auto-clean dead rows.

## Key Decisions Made

| Decision                                     | Choice                                                                  | Why (1 sentence)                                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PWA toolchain                                | Hand-rolled `manifest.webmanifest` + `public/sw.js`                     | `@vite-pwa/astro` 1.2.0's peer-deps don't list Astro 6 and Workbox is a black box for our scale — ~50 lines of readable SW beats a plugin install fight. |
| Push server library                          | `web-push@3.6.7` (pinned)                                               | Still the Node de-facto for VAPID; RFC 8291 is frozen so lack of recent releases doesn't matter; runs fine on Vercel Fluid Compute Node runtime.        |
| Permission-prompt timing                     | Deferred, gated on standalone-mode + user gesture                       | iOS Safari refuses `pushManager.subscribe` unless launched from home-screen icon — any "eager" flow silently fails on iPhone.                            |
| Onboarding UX                                | Dedicated `/install` page (per-platform instructions + notification controls) + subtle banner on `/groups/[id]` | The page owns education; the banner nudges without hijacking the group calendar UI.                                                                     |
| Test-push affordance                         | `POST /api/push/test` + button on `/install` after subscribe            | Solo dev debugging iOS push without a test button is a nightmare; the endpoint is cheap and only pushes to the caller.                                  |
| Subscription table shape                     | Per-device rows keyed by unique `endpoint`, cascade-delete on user      | Standard Web Push shape; unique-endpoint upserts handle "same device re-subscribes" cleanly; user delete cascades subscriptions.                        |
| Auth gate on new endpoints                   | Reuse S-02 pattern: `locals.user` + admin client; RLS as defense-only   | Lessons.md §2 — PostgREST `auth.uid()` broken on this project, so app-layer auth is the operative gate everywhere.                                       |
| Dev inner loop                               | `astro preview` (or Vercel Preview) only for PWA/push testing            | `astro dev` doesn't reliably serve SW (Vite HMR conflicts); iterating on SW in `dev` is a known time sink.                                              |
| Icon assets                                  | Resize `public/template.png` to 192 + 512 + maskable-512                | Real branded icons are a follow-up chore, not a blocker for proving the plumbing works.                                                                 |
| Notify-group call site                       | Deferred to S-03                                                        | This slice is F-02 (delivery foundation); S-03 owns the "when a session is confirmed" trigger.                                                          |

## Scope

**In scope:**
- Web app manifest + PWA meta tags in `Layout.astro`
- Hand-rolled service worker with `install`/`activate`/`fetch`/`push`/`notificationclick`/`pushsubscriptionchange` handlers
- Icon set (192, 512, maskable-512) resized from existing `template.png`
- `push_subscriptions` migration + RLS
- `src/lib/push.ts` with `sendPushToUser` + `PushPayload` type (S-03 imports these)
- Four API endpoints: `subscribe`, `unsubscribe`, `test`, `vapid-public-key`
- `/install` page with per-platform instructions + notification controls island
- Install banner on `/groups/[id]`
- Client-side push module (`push-client.ts`)
- VAPID keys generated and wired via Astro env schema (both `.env.local` and Vercel Env)

**Out of scope:**
- Session-confirmation notification flow (S-03)
- In-app notification inbox / history (PRD Non-Goal)
- Offline read cache (PRD says nice-to-have)
- Push denial fallback like email or SMS (PRD Open Q #3, deferred)
- Real branded icon design
- `@vite-pwa/astro` / Serwist / Workbox
- `beforeinstallprompt` custom install button on Android
- Automated tests (no test runner in repo)

## Architecture / Approach

Two independent halves:

1. **Client-facing PWA shell** — static assets (`manifest.webmanifest`, `sw.js`, icons) in `public/`; `<head>` links in `Layout.astro`; conditional SW registration in production only.
2. **Server-side push pipeline** — Supabase table + Astro API endpoints + `web-push` on Vercel Fluid Compute Node runtime. Auth gate is `locals.user` (JS check) → admin client → DB, matching every existing S-01/S-02 endpoint.

Data flow: client subscribes → `PushSubscription` JSON POSTed to `/api/push/subscribe` → row upserted keyed by `endpoint`. On send: server reads all rows for a `user_id` → `webpush.sendNotification` per row → 410/404 responses auto-delete rows.

## Phases at a Glance

| Phase                                                                     | What it delivers                                                                                    | Key risk                                                                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1. Manifest + SW scaffold + Layout head                                   | GameSlot is installable on Android + iOS; SW registered; no push handlers yet                       | iOS `apple-touch-icon` renders wrong / manifest fails Lighthouse installability audit; icon regeneration hiccups. |
| 2. `push_subscriptions` table + subscribe/unsubscribe/test endpoints + `sendPushToUser` helper | Server can persist a subscription and send a push; 410 cleanup path proven                          | VAPID key generation/wiring wrong (public key mismatch = subscribe fails silently); `web-push` compat on Node 24. |
| 3. `/install` page + client subscribe flow + SW push handlers             | End-to-end round trip: real user, real device, real push notification lands with app closed         | iOS silently doesn't deliver; `pushsubscriptionchange` handler bug causes silent long-term failure.               |

**Prerequisites:** S-01 done (needed for `/groups` context and the banner mount point) — check. F-01 done (needed for signed-in user) — check. Vercel deploy pipeline working — check (per S-02).

**Estimated effort:** ~3 sessions, one per phase. Phase 3 is the longest and involves real-device testing.

## Open Risks & Assumptions

- **iOS push reliability is empirically flaky** (per research and mid-2026 PWA state). The plan mitigates via `pushsubscriptionchange` + 410 cleanup, but expect churn — some devices will silently lose subscriptions and require a re-subscribe. Instrument delivery per S-03 for visibility.
- **`web-push` 3.6.7 has not shipped since Jan 2024**. RFC 8291 is frozen so functional risk is low, but Node 24 native-module warnings are possible; will surface on first Vercel deploy.
- **Icon quality**. `template.png`-derived icons will look generic. Users will notice on install; acceptable for the F-02 wedge but flag as a follow-up.
- **Assumption: F-02 is deployed to production before S-03 starts.** S-03's plan will import from `src/lib/push.ts` — that path must exist and be tested end-to-end before S-03 begins.
- **Assumption: `@astrojs/vercel` adapter serves `public/*.js` (i.e. `sw.js`) at the origin root without special config.** Verified against the current adapter behavior; noted here so a future adapter major-version bump gets scrutinized.

## Success Criteria (Summary)

- One real user installs GameSlot on both iOS Safari and Android Chrome from a Vercel Preview URL and receives a test push on each device (tab closed) — end-to-end proof that S-03 can trust the pipeline.
- `push_subscriptions` persists per-device rows and self-cleans on 410 Gone.
- `sendPushToUser(admin, userId, payload)` is exported, typed, and one function call away from S-03's confirm-session endpoint.
