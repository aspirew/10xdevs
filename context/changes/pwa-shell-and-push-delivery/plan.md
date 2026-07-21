# PWA Shell + Web Push Delivery — Implementation Plan

## Overview

Deliver F-02: turn GameSlot into an installable PWA on Android + iOS and prove a server → device push round-trip end-to-end with VAPID-signed Web Push. This is the enabling foundation for S-03 (host confirms session → group is push-notified — the north star). The slice does NOT ship a "notify group on confirm" call site — that belongs to S-03. It DOES ship the plumbing S-03 will call: `push_subscriptions` table, a server-side `sendPushToUser(userId, payload)` helper backed by `web-push`, and a UI-tested subscribe flow that survives iOS's "add-to-home-screen first" quirk.

## Current State Analysis

- **Framework**: Astro 6.3.1 SSR + `@astrojs/vercel` 10.0.7. React 19 islands. Tailwind 4. All server routes run on Vercel Fluid Compute (Node.js runtime) — `web-push` (Node-only lib) is fine there.
- **Layout head** (`src/layouts/Layout.astro:1-50`): only charset, an incomplete `<meta name="viewport">` (missing `content="width=device-width, initial-scale=1"`), and a favicon link. No theme-color, no apple-touch-icon, no manifest link.
- **public/** is nearly empty: `favicon.png`, `template.png`, `.assetsignore`. No manifest, no SW, no icons.
- **Middleware** (`src/middleware.ts:1-26`): populates `Astro.locals.user` from Supabase session; guards `/groups*`. No changes needed for this slice beyond `/install` being public.
- **Admin client** (`src/lib/supabase-admin.ts:1-16`): `createAdminClient()` returns service-role Supabase client or null. Used by every mutation endpoint since S-01.
- **Auth pattern** (lessons.md §2): PostgREST `auth.uid()` is broken on this project (`dchurjcpgzuoyunjsokl`). Every endpoint validates `locals.user` in JS, then calls the admin client. RLS policies exist as defense-in-depth against direct anon PostgREST traffic.
- **Env schema** (`astro.config.mjs:18-35`): uses Astro's `envField` with a Zod-like schema. We can extend it — server-context vars stay server-only, and the `PUBLIC_` prefix exposes vars to the client.
- **Migrations**: 3 files. Latest is `20260604190001_availability_start_hour_semantic.sql`. RLS convention: `to authenticated`, `is_group_member()` for group-scoped tables, `user_id = auth.uid()` in `with check` for user-owned tables.
- **API endpoint pattern**: S-01 uses form-encoded POST + 302 redirect for page-flow endpoints. S-02 introduced JSON-in/JSON-out for the calendar island endpoints (`.../availability/mark.ts`). This slice's endpoints are called from client JS — they follow the S-02 JSON pattern.
- **No existing `vercel.json`**. Adapter config is implicit.

### Key Discoveries

- Hand-rolled `public/sw.js` + `public/manifest.webmanifest` beats `@vite-pwa/astro` for this project: `@vite-pwa/astro` 1.2.0's `peerDependencies.astro` tops out at `^5.0.0` (Astro 6 unlisted), and Serwist/Workbox add value we don't need at 5–10 users. Hand-rolled = ~50 lines we can read end-to-end and ~zero peer-dep fights.
- `web-push` 3.6.7 is functionally stable (no release since Jan 2024) but the RFC 8291 push encryption it implements is frozen. Fine to pin and forget.
- Astro `dev` does not reliably serve service workers (Vite HMR interferes with SW registration and caching). All PWA/push testing must happen via `astro build && astro preview` locally OR on a Vercel Preview deploy. This is the single biggest inner-loop time sink to plan around.
- iOS Safari (mid-2026) still only allows `pushManager.subscribe` when the app is launched from the home-screen icon (`window.matchMedia('(display-mode: standalone)').matches`). The subscribe button MUST be gated on that check, and MUST fire from a user gesture. Any UI that assumes "install → prompt → subscribe" as one atomic flow will silently fail on iOS.
- `pushsubscriptionchange` handling is not optional — iOS drops subscriptions periodically. Without a SW-side handler that re-subscribes and re-POSTs, users appear to receive pushes for a while and then silently stop.
- Astro `envField` supports both `context: "server"` and `context: "client"`. `PUBLIC_VAPID_PUBLIC_KEY` is safe to expose (VAPID's public key is designed for client-side `applicationServerKey`); the private key stays server-only.

## Desired End State

A signed-in GameSlot user opens the app on their phone, installs it to the home screen following per-platform instructions on `/install`, opens the installed app, taps "Enable notifications," sees the browser permission prompt, allows, and sees a "Send test notification" affordance appear. Tapping it triggers a real push notification within a few seconds. The push lands even when the app tab is fully closed. Repeat on a second device and both devices receive their own test push. In Supabase Studio, two rows exist in `push_subscriptions` keyed by endpoint. The server helper `sendPushToUser(admin, userId, payload)` is exported for S-03 to import and call from the confirm-session endpoint (S-03 wires the call site; this slice ships the helper, tested via the test-push endpoint).

## What We're NOT Doing

- **No session-confirmation notification flow** — S-03 territory. This slice ships the `sendPushToUser` helper and proves it with a test endpoint; the confirm-session call site is deliberately deferred.
- **No in-app notification inbox / history view** — PRD §Non-Goals + Open Question #4. Push is ephemeral by design in v1.
- **No offline read cache** — PRD NFR calls offline read "nice to have," and it is out of scope here. SW is push-shell only, no runtime caching strategies beyond `NetworkOnly` for `/api/*` and `NetworkOnly` for HTML routes (SW is a push-and-lifecycle-only worker).
- **No push permission fallback** (email, SMS, etc.) — PRD Open Question #3. Accepted for v1: users who deny push don't get notified.
- **No polished icon assets** — the plan ships a working manifest with `template.png` (already in `public/`) resized to the required PWA sizes; a real icon set is a follow-up chore, not a blocker.
- **No `@vite-pwa/astro` install** — hand-rolled by choice (see Key Discoveries).
- **No Serwist / Workbox integration** — same reason.
- **No `beforeinstallprompt` custom install button on Android** in the first cut — we lean on the browser's native install UI plus the `/install` page instructions. Nice to add; deferred to avoid a Chrome-specific event listener path in v1.
- **No push-subscription encryption at rest** — subscription endpoints are not particularly sensitive (they're revocable tokens with no PII beyond `user_agent`). Standard row-level access via RLS + service-role writes suffices.
- **No automated tests** — repo has no test runner (consistent with S-01, S-02). All verification is manual + typecheck + lint + build.

## Implementation Approach

Three phases, each a vertical slab:

1. **Manifest + service worker scaffold + Layout head** — the app becomes installable. Nothing about push yet. Verified by opening on Android Chrome (sees install prompt) and iOS Safari (Share → Add to Home Screen produces an icon that launches standalone).
2. **`push_subscriptions` table + subscribe/unsubscribe/test endpoints + `sendPushToUser` helper** — the server can persist a subscription and send a push to a user. Verified via curl (subscribe with a captured PushSubscription JSON, then POST /api/push/test → real push lands on the device).
3. **/install page + client subscribe flow + SW push handlers** — end-user-facing round trip. The `/install` page owns per-platform instructions AND (once standalone-mode is detected) the "Enable notifications" + "Send test push" buttons. The SW handles `push`, `notificationclick`, and `pushsubscriptionchange` events.

The app-layer auth pattern from lessons.md §2 applies to every new endpoint: verify `locals.user`, then use the admin client. RLS policies on `push_subscriptions` mirror the S-02 shape — they matter only for direct anon PostgREST attacks.

## Critical Implementation Details

- **Dev-loop testing**. `astro dev` will not exercise the service worker reliably (Vite HMR conflicts with SW registration and Cache API). **AND** `@astrojs/vercel` adapter refuses the `astro preview` command entirely — verified 2026-07-21 mid-Phase-1: `[preview] The @astrojs/vercel adapter does not support the preview command.` So the plan's original "local preview OR Vercel Preview" collapses to **Vercel Preview only** for every manual verification step in this document. Push each phase's changes to a preview branch (or the default preview URL if working on main) and verify there. Do NOT try to iterate on SW code in `astro dev` — the debug loop is broken by default. Chrome DevTools → Application → Service Workers → Update on reload + Bypass for network + Unregister is the standard inner loop against the preview URL.
- **iOS standalone gate for subscribe**. `navigator.serviceWorker.ready.then(reg => reg.pushManager.subscribe(...))` will throw on iOS Safari when NOT launched from the home-screen icon, regardless of permission state. The `/install` page must check `window.matchMedia('(display-mode: standalone)').matches` and hide the "Enable notifications" button when false, showing the install instructions instead. Do NOT attempt to prompt for permission before this check — the user experience is silent failure.
- **`pushsubscriptionchange` is load-bearing** (and cookie-less). The service worker MUST implement a `pushsubscriptionchange` handler that (a) re-subscribes via `pushManager.subscribe` with the same `applicationServerKey` and (b) POSTs the new subscription to `/api/push/subscribe`. Without this, iOS devices go silent within days/weeks and the failure is invisible to both user and dev. Critically: `pushsubscriptionchange` fires without any open tab, so the session cookie may be days-stale and Supabase won't refresh it inside a SW request. `/api/push/subscribe` therefore has an **anonymous continuity path** — if the posted `endpoint` matches an existing row, allow the UPDATE of encryption keys without a session (see Phase 2 Change #4 for the contract). Without this path, the whole `pushsubscriptionchange` handler is silently useless after the first cookie expiry. Include a comment in the SW pointing at MDN and this plan.
- **410 Gone cleanup**. The `sendPushToUser` helper MUST treat `410 Gone` and `404 Not Found` responses from the push service as "subscription is dead" and DELETE the row from `push_subscriptions`. Otherwise dead endpoints accumulate and future S-03 sends waste time on them. Log the deletion so we can see churn.
- **VAPID key exposure model**. Astro `envField` with `context: "client", access: "public"` on `PUBLIC_VAPID_PUBLIC_KEY` is what makes the key readable from the browser via `import.meta.env.PUBLIC_VAPID_PUBLIC_KEY`. `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` stay `context: "server", access: "secret"`. Public-key exposure is by-design (that's how VAPID works); document it explicitly so a future review doesn't flag it.
- **SW scope**. Serving `sw.js` from `/sw.js` (root of `public/`) automatically gets scope `/`. Do NOT nest the SW under a subpath — it would need a `Service-Worker-Allowed` header via `vercel.json`, which adds a config file for zero gain. Keep it at the root.
- **`skipWaiting()` + `clients.claim()`**. Include both in the SW so users don't have to close every tab for updates to take effect. Accept the trade-off: a mid-session controller swap could theoretically confuse an open tab, but at 5–10 users on a mostly-idle app, the risk is negligible.

## Phase 1: Manifest + Service Worker Scaffold + Layout Head

### Overview

Make GameSlot installable on both Android Chrome and iOS Safari. Ship the manifest, a bare service worker (registration only — no push handlers yet), the PWA meta tags in the shared layout, and a resized icon set. No server changes.

### Changes Required:

#### 1. Web app manifest

**File**: `public/manifest.webmanifest` (new)

**Intent**: Declare GameSlot as an installable PWA with the properties Android/Chrome install prompts and iOS "Add to Home Screen" both consume. Kept minimal — no `shortcuts`, no `share_target`, no `related_applications`.

**Contract**: JSON with `name: "GameSlot"`, `short_name: "GameSlot"`, `start_url: "/"`, `display: "standalone"`, `background_color: "#ffffff"`, `theme_color: "#7c3aed"` (Tailwind purple-600 to match the S-02 overlap highlight), `icons: [{src, sizes, type, purpose}]` — see icon change below. Include `orientation: "portrait"` since the app is mobile-first.

#### 2. PWA icons

**File**: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png` (new — 3 files)

**Intent**: Provide the minimum icon set required by Android Chrome's install prompt (192 + 512 standard) plus one maskable variant for adaptive Android launchers. Use `public/template.png` as the source and resize via `sharp` (present as a transitive dep at `sharp@0.34.5`, no `sharp-cli` in the tree) with three one-off node invocations:

```bash
node -e "require('sharp')('public/template.png').resize(192,192).toFile('public/icons/icon-192.png')"
node -e "require('sharp')('public/template.png').resize(512,512).toFile('public/icons/icon-512.png')"
node -e "require('sharp')('public/template.png').resize(512,512).toFile('public/icons/icon-maskable-512.png')"
```

Zero new deps. Real branded icons are a follow-up chore.

**Contract**: Three PNGs at the paths above; sizes exactly 192×192, 512×512, 512×512. Referenced from the manifest's `icons` array with correct `sizes` + `purpose: "any"` (first two) and `purpose: "maskable"` (third).

#### 3. Service worker (registration + lifecycle only)

**File**: `public/sw.js` (new)

**Intent**: The minimal push-shell service worker. Phase 1 ships ONLY the install / activate / fetch pass-through lifecycle. `push`, `notificationclick`, `pushsubscriptionchange` are added in Phase 3 — this file starts as a stub so Phase 1's manual verification (install prompt on Android, SW registration in DevTools) is self-contained. Use `skipWaiting()` in `install` and `clients.claim()` in `activate` so updates roll out without requiring users to close every tab.

**Contract**: A vanilla `.js` file (NOT TypeScript — served as a static asset, not bundled). Exports nothing; wires two event listeners on `self`: `install` (calls `self.skipWaiting()`) and `activate` (calls `event.waitUntil(self.clients.claim())`). NO `fetch` listener — a no-op pass-through would just add a SW hop for zero benefit, and offline caching is explicitly out of scope. Total ~15 lines. See the SW gotchas in Critical Implementation Details.

#### 4. Layout head additions

**File**: `src/layouts/Layout.astro` (edit)

**Intent**: Wire the manifest + PWA-related meta tags into the shared `<head>`. Fix the currently-broken viewport meta (missing `content` attribute). Add theme-color (matches manifest), apple-touch-icon (points at icon-192), and a link to the manifest. Add a small inline script that registers `/sw.js` on load (skip in dev — `if (import.meta.env.PROD)` gate to avoid Vite HMR conflicts).

**Contract**: New tags inside `<head>`:
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />` (replace the existing incomplete one)
- `<meta name="theme-color" content="#7c3aed" />`
- `<link rel="manifest" href="/manifest.webmanifest" />`
- `<link rel="apple-touch-icon" href="/icons/icon-192.png" />`
- A `<script>` at the end of `<head>` that calls `navigator.serviceWorker.register('/sw.js')` guarded by `if (import.meta.env.PROD && 'serviceWorker' in navigator)` — Astro-idiomatic, works for `astro preview` (which runs a prod build) and Vercel Preview alike, skips `astro dev`.

No changes to `<body>`. No JSX/TSX conversion.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds (no warnings about missing manifest / sw.js references)
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png` all exist
- No new runtime dependencies added to `package.json` (icon resize uses one-off npx invocation)

#### Manual Verification:

- Push to Vercel Preview; open the preview URL in Chrome desktop — DevTools → Application → Manifest shows the manifest parsed with no errors; Service Workers panel shows `/sw.js` as activated (localhost preview is not viable — `@astrojs/vercel` adapter refuses `astro preview`)
- Chrome desktop against Vercel Preview: install button appears in the address bar; clicking it produces a standalone-window install
- Chrome Android on a real phone (or Vercel Preview deploy — mandatory for iOS testing): install-to-home-screen prompt fires; installed app launches standalone (no browser chrome)
- iOS Safari on a real iPhone against a Vercel Preview deploy: Share → Add to Home Screen shows GameSlot icon (apple-touch-icon renders correctly, not a generic favicon); tapping the home-screen icon launches standalone
- Chrome DevTools → Application → Service Workers → "Update on reload" checked + reload → SW updates without requiring tab close (proves `skipWaiting` + `clients.claim`)
- Lighthouse PWA audit on the preview build passes the installability checks (manifest present, icons valid, SW registered)

**Implementation Note**: After Phase 1's automated checks pass and the manual PWA-install checks pass on BOTH iOS Safari and Android Chrome against a Vercel Preview, pause for confirmation before moving to Phase 2. Do NOT skip the iOS test — the whole point of this slice is that iOS actually works, and iOS is the platform where it can quietly fail.

---

## Phase 2: Subscription Persistence + Server-side Push

### Overview

Create the `push_subscriptions` table and its RLS policies, wire the `web-push` library with VAPID keys from env, and ship three JSON endpoints (`subscribe`, `unsubscribe`, `test`) plus one server-side helper (`sendPushToUser`) that S-03 will import in its own change. All endpoints follow the S-02 JSON pattern (JSON in, JSON out, `locals.user` gate, admin client for DB).

### Changes Required:

#### 1. Migration: `push_subscriptions` table + RLS

**File**: `supabase/migrations/<timestamp>_push_subscriptions.sql` (generate via `npx supabase migration new push_subscriptions`)

**Intent**: Per-device subscription rows keyed by endpoint (deduplication on re-subscribe from the same device). RLS policies follow the S-02 shape — users can read/delete their own, INSERT via service role only (client posts through our API, never direct PostgREST). Endpoint uniqueness enables `ON CONFLICT (endpoint) DO UPDATE` semantics in the subscribe endpoint.

**Contract**:

```sql
create table push_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  endpoint           text not null unique,
  p256dh             text not null,
  auth               text not null,
  expiration_time    timestamptz,
  user_agent         text,
  created_at         timestamptz not null default now(),
  last_success_at    timestamptz,
  last_failure_at    timestamptz,
  failure_count      integer not null default 0
);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions: self read"
  on push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create policy "push_subscriptions: self delete"
  on push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
```

No INSERT / UPDATE policies — the admin client (service role) bypasses RLS for those, and no user-facing path writes directly. Apply via `npx supabase db push --linked` per lessons.md §"Apply Supabase migrations via the CLI…".

#### 2. VAPID key env vars

**File**: `astro.config.mjs` (edit — env schema block only)

**Intent**: Register three new env vars in the Astro `envField` schema so `import.meta.env` type-safely reads them at build time.

**Contract**: Add to the existing schema:
- `VAPID_PUBLIC_KEY`: `envField.string({ context: "server", access: "secret", optional: false })`
- `VAPID_PRIVATE_KEY`: `envField.string({ context: "server", access: "secret", optional: false })`
- `VAPID_SUBJECT`: `envField.string({ context: "server", access: "secret", optional: false })` — a `mailto:you@example.com` URI
- `PUBLIC_VAPID_PUBLIC_KEY`: `envField.string({ context: "client", access: "public", optional: false })` — same string as `VAPID_PUBLIC_KEY`; duplicated because Astro requires the `PUBLIC_` prefix + `access: "public"` combo for client access

**Note**: this is the first genuinely client-context env var in the repo. The existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is declared `context: "server", access: "secret"` despite its misleading `NEXT_PUBLIC_` prefix and is never bundled to the client (imported via `astro:env/server` in `src/lib/supabase.ts`). The VAPID public key is different — it MUST reach both the SW (fetched via `/api/push/vapid-public-key`) AND the browser bundle (`import.meta.env.PUBLIC_VAPID_PUBLIC_KEY` inside `src/lib/push-client.ts` for `applicationServerKey`). Client exposure is by-design for VAPID and safe — the private key stays server-only.

Also: add all four to `.env.local` (developer's local file) and to Vercel Env (Preview + Production). Generate the keys ONCE with `npx web-push generate-vapid-keys --json` and paste into both env stores. Values are documented in change.md `## Notes` — actual secrets never committed.

#### 3. Web-push wiring

**File**: `src/lib/push.ts` (new)

**Intent**: Central place to configure `web-push` with VAPID keys and to expose two server-only helpers used by the endpoints AND (in S-03) the confirm-session flow. Keeps `web-push` import in exactly one file so version-pinning and future replacement are easy.

**Contract**: Exports:
- `sendPushToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<SendResult>` — reads all subscription rows for `userId`, sends to each via `webpush.sendNotification(sub, JSON.stringify(payload))`, on `410` or `404` DELETEs the row, on other errors bumps `failure_count` and stamps `last_failure_at`. Returns `{ sent: number, failed: number, deleted: number }` for logging.
- `PushPayload` type: `{ title: string; body: string; url?: string; tag?: string }` — the shape the SW `push` handler will consume in Phase 3. Kept small and JSON-serializable.

Also install `web-push@3.6.7` as a runtime dep: `npm install web-push@3.6.7 && npm install --save-dev @types/web-push`. Pin the exact version — `web-push` hasn't shipped since Jan 2024 so `^3.6.7` and `3.6.7` are equivalent today, but the exact pin makes the intent explicit.

#### 4. POST /api/push/subscribe

**File**: `src/pages/api/push/subscribe.ts` (new)

**Intent**: Persist a client-supplied `PushSubscription` JSON as a row keyed by endpoint. Called from client on first successful subscribe AND from the SW's `pushsubscriptionchange` handler. Idempotent via `ON CONFLICT (endpoint) DO UPDATE` — same device re-subscribing overwrites the old row with fresh keys.

**Contract**: `POST /api/push/subscribe` body:
```json
{ "endpoint": "https://...", "keys": { "p256dh": "...", "auth": "..." }, "expirationTime": null | number }
```
Auth: two paths.
- **Authenticated path** (`locals.user` present): standard upsert. `ON CONFLICT (endpoint) DO UPDATE SET user_id = <caller>, p256dh, auth, expiration_time, user_agent, last_success_at = null, last_failure_at = null, failure_count = 0`. Captures `user_agent` from request headers.
- **Anonymous continuity path** (`locals.user` null): look up the row by `endpoint`. If a row exists, UPDATE only the encryption keys (`p256dh`, `auth`, `expiration_time`) — do NOT touch `user_id`. If no row exists, return 401. This exists specifically for the SW's `pushsubscriptionchange` handler, which fires with no open tab and a possibly-stale session cookie. Endpoint URLs are opaque browser-issued tokens with no PII value; treating a known endpoint as proof-of-continuity is defensible because delivery still lands only on the original device. Log every anonymous-continuity update so we can see the volume.

Validation: `endpoint` non-empty string; `keys.p256dh` and `keys.auth` non-empty strings (400 otherwise). On success: 200 `{ ok: true }`.

#### 5. POST /api/push/unsubscribe

**File**: `src/pages/api/push/unsubscribe.ts` (new)

**Intent**: Delete a subscription by endpoint. Called from client when user explicitly disables notifications. Idempotent — deleting a non-existent row returns 200.

**Contract**: `POST /api/push/unsubscribe` body: `{ "endpoint": "https://..." }`. Auth: `locals.user` required. Additional check: only delete rows where `user_id = locals.user.id` (defense-in-depth against a user posting someone else's endpoint). Response: 200 `{ ok: true }`.

#### 6. POST /api/push/test

**File**: `src/pages/api/push/test.ts` (new)

**Intent**: Trigger `sendPushToUser` for the calling user with a canned payload. Exists specifically for manual verification and for the /install page's "Send test notification" button. Cheap to keep in production — it only pushes to the caller.

**Contract**: `POST /api/push/test`, no body. Auth: `locals.user` required. Calls `sendPushToUser(admin, locals.user.id, { title: "GameSlot", body: "Test notification — this is what session confirmations will feel like.", url: "/groups" })`. Response: 200 `{ sent, failed, deleted }` — the raw result from the helper, so the client can display "sent to N devices."

### Success Criteria:

#### Automated Verification:

- Migration file exists at `supabase/migrations/<timestamp>_push_subscriptions.sql`
- `npx supabase db diff --linked` (or Studio `\d push_subscriptions`) shows the columns + RLS policies + unique constraint + index as expected
- `npm run typecheck` passes with the new endpoints + helper + env vars
- `npm run lint` passes
- `npm run build` succeeds
- `web-push@3.6.7` present in `package.json` dependencies; `@types/web-push` in devDependencies

#### Manual Verification:

- Migration applied via `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl`; Studio `\d+ push_subscriptions` shows unique index on `endpoint` + FK to `auth.users` with `ON DELETE CASCADE`
- Anon PostgREST select on `push_subscriptions` returns zero rows (RLS denies unauthenticated)
- With member cookies on Vercel Preview: use browser DevTools to grab a real `PushSubscription` from a captured iOS/Chrome session (Phase 3 provides the flow that captures one), then `curl` the preview URL. Confirm `POST /api/push/subscribe` returns `{ok: true}` and Studio shows the row. (Localhost curl is not viable — Vercel adapter refuses `astro preview`; run every Phase 2 curl against the Vercel Preview URL instead.)
- Repeat the same subscribe curl → still `{ok: true}`, no duplicate row (upsert on endpoint works)
- `POST /api/push/test` returns `{sent: 1, failed: 0, deleted: 0}` and a real push notification lands on the device (with the tab CLOSED)
- `POST /api/push/unsubscribe` with the same endpoint returns `{ok: true}`; Studio confirms the row is gone
- Non-member curl (unauthenticated) on all three endpoints returns 401
- Malformed body on `/subscribe` (missing `endpoint` or `keys`) returns 400
- Manually mangle a subscription row's `endpoint` in Studio to something that will 410 (e.g. change one character), then call `/api/push/test` → response reports `deleted: 1` and the row is gone from Studio (410-cleanup path works)

**Implementation Note**: Phase 2's manual verification requires having a real PushSubscription in hand. Two ways: (a) do Phase 3 first for one device, capture the subscription from DevTools → Application → Service Workers → Push, then curl-verify Phase 2 with that captured JSON; or (b) use a throwaway browser-side snippet on the preview URL that subscribes and dumps JSON to the console, without shipping the /install UI. Either way, exercise the 410 path — that's the one most likely to bit-rot silently once we're in S-03. Pause for confirmation before moving to Phase 3.

---

## Phase 3: /install Page + Client Subscribe Flow + SW Push Handlers

### Overview

Ship the end-user-facing surface. `/install` is a public page that (a) shows per-platform install instructions when NOT running standalone, and (b) shows notification controls when standalone. The SW gains its three push-related event listeners. A small "Enable notifications to know when sessions are confirmed" banner appears on `/groups/[id]` when the user is signed in but not subscribed on this device.

### Changes Required:

#### 1. Service worker push handlers

**File**: `public/sw.js` (edit — append handlers, do NOT rewrite Phase 1 lifecycle)

**Intent**: Wire the three push-related SW events. `push` displays the notification with data from the JSON payload. `notificationclick` closes the notification and focuses/opens the app at the payload's `url`. `pushsubscriptionchange` re-subscribes with the same `applicationServerKey` and POSTs the new subscription — this is the load-bearing handler per Critical Implementation Details.

**Contract**: Three new event listeners appended to the existing SW:
- `self.addEventListener('push', (event) => {...})` — parses `event.data.json()` as `PushPayload` (defensive: falls back to `{title: 'GameSlot', body: event.data?.text() ?? ''}` if JSON parse fails), calls `self.registration.showNotification(title, { body, tag, data: { url }, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' })`.
- `self.addEventListener('notificationclick', (event) => {...})` — `event.notification.close()`, then `event.waitUntil(clients.matchAll({type:'window'}).then(list => list.find(c => c.url.includes(event.notification.data?.url ?? '/'))?.focus() ?? clients.openWindow(event.notification.data?.url ?? '/')))`.
- `self.addEventListener('pushsubscriptionchange', (event) => {...})` — `event.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: /* fetch from a well-known route or hardcode from build-time */ }).then(sub => fetch('/api/push/subscribe', { method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify(sub) })))`.

The `applicationServerKey` inside `pushsubscriptionchange` is the sticky bit: the SW is a static file and doesn't have build-time env access. Options: (a) inline the public key at deploy time via a build step, or (b) fetch `/api/push/vapid-public-key` first. Choose (b) — one tiny endpoint, no build-step magic. Add a fourth endpoint below.

#### 2. GET /api/push/vapid-public-key

**File**: `src/pages/api/push/vapid-public-key.ts` (new)

**Intent**: One-line endpoint that returns `import.meta.env.PUBLIC_VAPID_PUBLIC_KEY` as JSON. Exists specifically so the SW (a static file with no build-time env access) can fetch the key inside `pushsubscriptionchange`.

**Contract**: `GET /api/push/vapid-public-key` — no auth required (the key is public by design). Response: 200 `{ key: string }`. Cache-Control: `public, max-age=3600`.

#### 3. Client push helper module

**File**: `src/lib/push-client.ts` (new)

**Intent**: All browser-side push logic in one testable module — separate from React components. Handles feature detection, standalone-mode check, permission request, subscribe, and unsubscribe. Returns typed statuses the UI can render.

**Contract**: Exports:
- `getPushStatus(): 'unsupported' | 'not-standalone' | 'permission-default' | 'permission-denied' | 'subscribed' | 'not-subscribed'` — pure feature/state check, no side effects.
- `subscribeCurrentUser(): Promise<{ ok: true } | { ok: false; reason: string }>` — requests permission, subscribes via `pushManager`, POSTs to `/api/push/subscribe`.
- `unsubscribeCurrentUser(): Promise<{ ok: true } | { ok: false; reason: string }>` — reads current subscription, calls its `.unsubscribe()`, POSTs to `/api/push/unsubscribe`.
- `sendTestPush(): Promise<{ sent: number }>` — POSTs to `/api/push/test`.

Uses `PUBLIC_VAPID_PUBLIC_KEY` from `import.meta.env` for `applicationServerKey` (converted from URL-safe base64 to `Uint8Array` — standard utility, ~10 lines).

#### 4. /install page (Astro page)

**File**: `src/pages/install.astro` (new)

**Intent**: Public onboarding page that (a) shows install instructions per platform when NOT standalone, and (b) hosts a React island with notification controls when standalone. Public because we may want to link to it from an outside message ("open GameSlot: gameslot.link/install"), and the notification-controls UI itself checks `locals.user` at the island level for the buttons that require auth.

**Contract**: Server-side, no data fetching, no admin client. Body:
- A `<section>` with "Install GameSlot" heading + platform-detected instructions. Detect platform via user-agent server-side (simple regex on `Astro.request.headers.get('user-agent')`) and render iOS vs Android vs Desktop-Chrome instructions. Include screenshots-as-text ("Tap Share → Add to Home Screen") — no image assets; keep it text-based for the wedge.
- A `<NotificationControls client:load />` React island (see next change). The island is rendered unconditionally; it self-hides or shows different UI based on `getPushStatus()`.

#### 5. NotificationControls island

**File**: `src/components/NotificationControls.tsx` (new)

**Intent**: The interactive part of `/install`. Owns `getPushStatus()` on mount + on `visibilitychange` (users navigate away, install, come back — status flips). Renders one of five states: unsupported (browser doesn't support Push), not-standalone (grey out with "Install to your home screen first"), permission-default (a big "Enable notifications" button), permission-denied (instructions to re-enable in browser settings), subscribed (a "Send test notification" button + an "Unsubscribe" button).

**Contract**: Zero props. Internal state: `{ status, testResult, error }`. Calls into `src/lib/push-client.ts`. Uses shadcn `Button` from `src/components/ui/button.tsx` (already present per S-01/S-02). Also checks `locals.user` via a `getCurrentUser` server endpoint... actually simpler: pass `userIsSignedIn` as a prop from `install.astro` (server has it via `Astro.locals.user`) and gate the subscribe button on it, redirecting to sign-in if false.

**Revised contract**: Props: `{ isSignedIn: boolean }`. If `!isSignedIn` and status would be `permission-default`, render "Sign in first" linking to `/auth/signin?next=/install`.

#### 6. Install banner on group detail page

**File**: `src/pages/groups/[id].astro` (edit)

**Intent**: Nudge signed-in members toward installing + subscribing. Add a small dismissible banner at the top of the page (above the S-01 Members section) shown only when the user is not yet subscribed on this device. Banner links to `/install`. Dismissal is per-device via localStorage — no server state.

**Contract**: A new React island `<InstallPushBanner client:load />` (new file below) rendered at the top of `groups/[id].astro`'s body. Island self-checks `getPushStatus()` and localStorage dismissal; renders null when subscribed, when unsupported, when denied, or when previously dismissed.

**Sub-change**: `src/components/InstallPushBanner.tsx` (new) — implements the above. ~30 lines. Uses shadcn `Card` primitive.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- All five new files present at listed paths: `public/sw.js` (edited from Phase 1), `src/lib/push-client.ts`, `src/pages/install.astro`, `src/components/NotificationControls.tsx`, `src/components/InstallPushBanner.tsx`, `src/pages/api/push/vapid-public-key.ts`

#### Manual Verification:

- iOS Safari on real iPhone against Vercel Preview: `/install` shows iOS-specific "Add to Home Screen" instructions when accessed from Safari-in-a-tab. Launch installed app from home screen; open `/install`; see "Enable notifications" button (permission-default state)
- Tap "Enable notifications" → iOS shows the system permission prompt; allow it → button flips to subscribed state; Supabase Studio shows a new row in `push_subscriptions` for the user
- Tap "Send test notification" → within a few seconds a system notification appears (even if the app is backgrounded); tapping the notification opens/focuses the app at `/groups`
- Repeat on Android Chrome on a real Android phone: install prompt fires natively; installed app allows the same subscribe → test flow
- Repeat again on a second browser (incognito or a second real device): two rows in `push_subscriptions`; sending a test from one device only pushes to that device (correct — test push is scoped to the calling user's rows, all their devices)
- On the group detail page (`/groups/<id>`): before subscribing, banner appears at the top with "Install GameSlot to get notified…"; after subscribing on that device, banner is gone on reload; after clicking dismiss on the banner, banner is gone on reload (localStorage flag)
- SW `pushsubscriptionchange`: hard to force without waiting for iOS to naturally rotate — smoke test by manually calling `event.dispatchEvent(new Event('pushsubscriptionchange'))` inside DevTools SW console; confirm a re-subscribe attempt fires (will 401 without cookies but the codepath runs)
- Tag production deploy as `prod-<date>-f02` after Phase 3 manual verification passes on both platforms — gives S-03 a known-good rollback target

**Implementation Note**: Phase 3 is the largest and requires the most cross-device testing. Do NOT close this out based on desktop-only verification. iOS + Android smoke on real devices via Vercel Preview is the only bar that matters — this whole slice exists to prove push works on the platforms end users have.

---

## Testing Strategy

No automated tests are added (no test runner in the repo; consistent with S-01, S-02).

### Manual Testing Steps:

1. **Vercel Preview build verification.** Push to Vercel Preview, open the preview URL in Chrome — DevTools → Application panel confirms manifest parsed, SW registered, icons all resolve. (`astro preview` isn't available under `@astrojs/vercel`; local build sanity is limited to `npm run build` completing successfully.)
2. **Android install + push.** Real Android device on Vercel Preview: install prompt, launch standalone, enable notifications, receive test push with app backgrounded.
3. **iOS install + push.** Real iPhone on Vercel Preview: Add to Home Screen from Safari, launch icon (must be standalone before enabling), receive test push with app killed.
4. **Multi-device.** Same user on two devices → two subscription rows → test push lands on both.
5. **Unsubscribe.** Tap unsubscribe on `/install` → subscription row deleted; test push returns `{sent: 0}`.
6. **410 cleanup.** Manually corrupt an endpoint in Studio → next test send reports `deleted: 1` and row disappears.
7. **Banner UX.** Group detail page banner appears when not subscribed; disappears after subscribe; dismissible via close button; stays dismissed via localStorage.
8. **Sign-in gating.** `/install` accessed while signed out shows install instructions but the notification-controls island shows "Sign in first" instead of the enable button.
9. **Production smoke.** Repeat step 2-3 against `https://10xdevs-lilac.vercel.app` after production deploy.

## Performance Considerations

At 5-10 users × ~2 devices each = ~20 subscription rows max. `sendPushToUser` fires N sequential `webpush.sendNotification` calls per user; for N ≤ 2 there's no need for parallelism. If S-03 ever calls `sendPushToUser` for every member of a group on session confirmation, worst case = 10 members × 2 devices = 20 push calls sequential — under a second. If that ever grows, wrap in `Promise.allSettled`.

VAPID JWT signing per send is cheap (ES256 signing on a ~200-byte JWT). `web-push`'s built-in JWT is regenerated per request, not cached — that's fine at this scale.

## Migration Notes

No data migration. `push_subscriptions` starts empty. No changes to `groups`, `group_members`, or `availability`.

The `sw.js` file, once registered, is sticky — future SW updates must ship a new file with different content (browsers hash the SW to detect changes) OR bump a version constant inside the file. Phase 1's SW is trivial; Phase 3 modifies the same file, and users who install after Phase 1 but before Phase 3 will pick up Phase 3 automatically on next reload thanks to `skipWaiting`.

## References

- Roadmap entry: `context/foundation/roadmap.md` § F-02
- PRD FRs: FR-012 (push notification) + NFR §Progressive Web App
- US-01 Then clause: "every member of the group receives a push notification"
- S-02's plan (JSON endpoint pattern source): `context/archive/2026-06-04-mark-availability-with-overlap/plan.md`
- S-01's migration + RLS shape: `supabase/migrations/20260601210816_groups_and_members.sql`
- App-layer auth gate: `context/foundation/lessons.md` §"Verify PostgREST honors `auth.uid()`…"
- Migration CLI rule: `context/foundation/lessons.md` §"Apply Supabase migrations via the CLI…"
- Admin-client factory: `src/lib/supabase-admin.ts:1-16`
- Middleware + `locals.user`: `src/middleware.ts:1-26`
- Existing Layout `<head>`: `src/layouts/Layout.astro:1-50`
- Env schema pattern: `astro.config.mjs:18-35`
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- `web-push` npm: https://www.npmjs.com/package/web-push

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Manifest + Service Worker Scaffold + Layout Head

#### Automated

- [x] 1.1 `npm run typecheck` passes — 19992fa
- [x] 1.2 `npm run lint` passes — 19992fa
- [x] 1.3 `npm run build` succeeds with no warnings about missing manifest/sw.js — 19992fa
- [x] 1.4 `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-{192,512,maskable-512}.png` all exist — 19992fa
- [x] 1.5 No new runtime deps added to `package.json` — 19992fa

#### Manual

- [x] 1.6 Vercel Preview: DevTools shows manifest parsed OK and `/sw.js` activated (localhost preview unavailable — Vercel adapter refuses `astro preview`) — 19992fa
- [x] 1.7 Chrome desktop on Vercel Preview: install button appears and produces a standalone window — 19992fa
- [x] 1.8 Android Chrome on real phone (or Vercel Preview): install-to-home-screen prompt fires; app launches standalone — 19992fa
- [x] 1.9 iOS Safari on real iPhone (Vercel Preview): Add to Home Screen shows apple-touch-icon; installed app launches standalone — 19992fa
- [x] 1.10 SW `Update on reload` reloads without requiring tab close (proves skipWaiting + clients.claim) — 19992fa
- [x] 1.11 Lighthouse PWA audit installability checks pass on the preview build — 19992fa

### Phase 2: Subscription Persistence + Server-side Push

#### Automated

- [x] 2.1 Migration file exists at `supabase/migrations/<timestamp>_push_subscriptions.sql` — 78503f1
- [x] 2.2 `npx supabase db diff --linked` (or Studio `\d`) shows expected shape (cols + unique endpoint + FK + 2 RLS policies + index) — 78503f1
- [x] 2.3 `npm run typecheck` passes — 78503f1
- [x] 2.4 `npm run lint` passes — 78503f1
- [x] 2.5 `npm run build` succeeds — 78503f1
- [x] 2.6 `web-push@3.6.7` in `dependencies`, `@types/web-push` in `devDependencies` — 78503f1

#### Manual

- [x] 2.7 Migration applied via `npx supabase db push --linked` against `dchurjcpgzuoyunjsokl` — 78503f1
- [x] 2.8 Studio `\d+ push_subscriptions` shows unique on `endpoint` + FK to `auth.users` ON DELETE CASCADE — 78503f1
- [x] 2.9 Anon PostgREST select on `push_subscriptions` returns zero rows (RLS denies) — 78503f1
- [ ] 2.10 `POST /api/push/subscribe` with a captured PushSubscription JSON returns `{ok:true}`; row visible in Studio
- [ ] 2.11 Repeated subscribe call returns `{ok:true}`; no duplicate row (upsert on endpoint works)
- [ ] 2.11a Anonymous continuity: subscribe curl with NO cookies but with an existing endpoint returns `{ok:true}` and updates keys without touching user_id; subscribe curl with NO cookies and a NEW endpoint returns 401 (reject anon inserts)
- [ ] 2.12 `POST /api/push/test` returns `{sent:1, failed:0, deleted:0}` and a real push lands (tab CLOSED)
- [ ] 2.13 `POST /api/push/unsubscribe` returns `{ok:true}`; row gone in Studio
- [ ] 2.14 Unauthenticated call on `/test` and `/unsubscribe` returns 401; unauth `/subscribe` returns 401 for new endpoints and 200 for existing (see 2.11a); vapid-public-key is public
- [ ] 2.15 Malformed body on subscribe returns 400
- [ ] 2.16 Corrupt endpoint → test send reports `deleted: 1` and row disappears (410 cleanup)

### Phase 3: /install Page + Client Subscribe Flow + SW Push Handlers

#### Automated

- [x] 3.1 `npm run typecheck` passes
- [x] 3.2 `npm run lint` passes
- [x] 3.3 `npm run build` succeeds
- [x] 3.4 All five new files exist: `push-client.ts`, `install.astro`, `NotificationControls.tsx`, `InstallPushBanner.tsx`, `vapid-public-key.ts` + `sw.js` edits

#### Manual

- [ ] 3.5 iOS: `/install` in Safari shows iOS-specific Add-to-Home-Screen instructions
- [ ] 3.6 iOS: installed app shows "Enable notifications" button; permission prompt fires; button flips to subscribed
- [ ] 3.7 iOS: "Send test notification" produces a real push within seconds; tapping the notification opens app at `/groups`
- [ ] 3.8 Android: install prompt native; subscribe + test push work identically
- [ ] 3.9 Two-device: two rows in `push_subscriptions`; test push from device A lands on device A only (own-user scoping)
- [ ] 3.10 `/groups/<id>` banner: appears when not subscribed, disappears after subscribing on that device, stays dismissed via localStorage after close click
- [ ] 3.11 `/install` accessed signed-out: notification-controls island shows "Sign in first" link with `?next=/install`
- [ ] 3.12 SW `pushsubscriptionchange` codepath fires (smoke via DevTools dispatchEvent)
- [ ] 3.13 Production smoke at `https://10xdevs-lilac.vercel.app` passes install + push on both platforms
- [ ] 3.14 Tag production deploy as `prod-<date>-f02`
