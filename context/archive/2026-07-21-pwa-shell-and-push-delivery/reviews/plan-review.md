<!-- PLAN-REVIEW-REPORT -->
# Plan Review: PWA Shell + Web Push Delivery

- **Plan**: `context/changes/pwa-shell-and-push-delivery/plan.md`
- **Mode**: Deep
- **Date**: 2026-07-21
- **Verdict**: REVISE → **SOUND after triage** (6/6 findings fixed in plan)
- **Findings**: 1 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

8/8 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — sharp-cli isn't installed; `npx sharp-cli` will download unpinned

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 → Change #2 (PWA icons)
- **Detail**: Plan says "sharp is already in the tree via Astro's Image service" (verified — `sharp@0.34.5` present in node_modules) then proposes `npx sharp-cli --input ... --output ... --resize 192`. But `sharp-cli` is a separate package that is NOT installed; `npx sharp-cli` would trigger a network install of an unpinned CLI, contradicting the phase's own "no new deps" success criterion. The transitive `sharp` module itself IS usable via node one-liners.
- **Fix**: Replace with `node -e "require('sharp')('public/template.png').resize(192,192).toFile('public/icons/icon-192.png')"` (and 512/maskable-512 equivalents). Zero new deps.
- **Decision**: FIXED — plan Phase 1 → Change #2 updated with three node -e sharp invocations

### F2 — `pushsubscriptionchange` re-subscribe silently drops when session cookie has expired

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 3 → Change #1 (SW `pushsubscriptionchange` handler) + Phase 2 → Change #4 (POST /api/push/subscribe)
- **Detail**: Verified: Supabase SSR cookies (httpOnly: false, sameSite: "lax") DO attach to same-origin SW fetch with `credentials: 'include'`. But `pushsubscriptionchange` fires *without an open tab* — the SW wakes up, the browser's session cookie may be days/weeks stale, the refresh path never runs. Result: SW gets a fresh PushSubscription, POSTs to /api/push/subscribe, endpoint returns 401 because `locals.user` is null, SW silently drops. Two weeks later the user "stopped getting notifications" and there's no signal it happened.
- **Fix A ⭐ Recommended**: Accept anonymous re-subscribe if endpoint already exists
  - Approach: In /api/push/subscribe, if `locals.user` is null but the posted `endpoint` matches an existing row, allow the UPDATE. Only reject anonymous inserts for NEW endpoints.
  - Strength: Solves the exact failure mode without needing SW refresh-token dance. Endpoint URL is a rotating opaque token — treating it as proof-of-continuity is defensible.
  - Tradeoff: Attacker with someone else's raw endpoint could refresh keys on it — but delivery still lands on the original device.
  - Confidence: HIGH — pattern web-push-libs recommends for this exact scenario.
  - Blind spot: Haven't confirmed Supabase never refreshes cookie inside `pushsubscriptionchange`.
- **Fix B**: Store `expected_user_id` in SW IndexedDB and include in resubscribe POST
  - Approach: SW keeps last-known user_id in IndexedDB; resubscribe POST includes it; server verifies matches endpoint row.
  - Strength: No relaxation of endpoint auth model.
  - Tradeoff: SW IndexedDB dance is a new surface with own bugs; still needs Fix A for very first pushsubscriptionchange after install.
  - Confidence: MEDIUM.
  - Blind spot: iOS PWA IndexedDB persistence is famously flaky.
- **Decision**: FIXED — plan Phase 2 → Change #4 gains an anonymous continuity path (existing endpoint → allow key update without session; new endpoint → still 401). Critical Implementation Details expanded to explain why. Progress rows 2.11a and 2.14 revised to enforce.

### F3 — SW registration gate offers "pick one" — plan should pick

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 → Change #4 (Layout head additions)
- **Detail**: Plan says: "conditionally on `import.meta.env.PROD` (or `location.hostname !== 'localhost'` — pick one and stick with it)". The point of the plan is to remove decisions from the implementer's hands.
- **Fix**: Pick `import.meta.env.PROD` explicitly — Astro-idiomatic, works for `astro build && preview` (where all Phase 1 verification happens) and Vercel Preview.
- **Decision**: FIXED — plan Phase 1 → Change #4 now says `if (import.meta.env.PROD && 'serviceWorker' in navigator)` unambiguously

### F4 — Phase 3 says "All four new files" but lists five

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 → Success Criteria → Automated
- **Detail**: "All four new files exist: `push-client.ts`, `install.astro`, `NotificationControls.tsx`, `InstallPushBanner.tsx`, `vapid-public-key.ts` + `sw.js` edits" — that's five new files. Cosmetic.
- **Fix**: Change "four" → "five" in the criterion text.
- **Decision**: FIXED — Phase 3 automated criterion + Progress row 3.4 both updated to "five" with full path list

### F5 — Phase 1 SW `fetch` handler is a no-op pass-through

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 1 → Change #3 (Service worker)
- **Detail**: Plan says SW `fetch` handler does `event.respondWith(fetch(event.request))`. That's a pure pass-through — browser behavior without any `fetch` listener is identical. Adds a SW hop to every request for zero benefit.
- **Fix**: Omit the `fetch` listener entirely in Phase 1 (and Phase 3 — caching is explicitly out of scope).
- **Decision**: FIXED — Phase 1 Change #3 contract now specifies only install + activate listeners (~15 lines, no fetch)

### F6 — envField pattern for PUBLIC_VAPID_PUBLIC_KEY diverges from repo convention

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 → Change #2 (VAPID key env vars)
- **Detail**: Existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is declared `context: "server", access: "secret"` despite its NEXT_PUBLIC_ prefix (never actually exposed to browser). Plan proposes `PUBLIC_VAPID_PUBLIC_KEY` with `context: "client", access: "public"` — correct choice (VAPID public key must reach the browser), just a first-in-repo pattern.
- **Fix**: Add one sentence noting this is the first `context: "client"` env var in the repo and why it's necessary here (client bundle needs it for `applicationServerKey`).
- **Decision**: FIXED — Phase 2 Change #2 body now contains a **Note** paragraph explaining the divergence and why VAPID public key genuinely needs client access
