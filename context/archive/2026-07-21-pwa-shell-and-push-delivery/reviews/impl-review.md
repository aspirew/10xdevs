<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: PWA Shell + Web Push Delivery

- **Plan**: `context/changes/pwa-shell-and-push-delivery/plan.md`
- **Scope**: Full plan — Phase 1, Phase 2, Phase 3 + Topbar follow-up + epilogue
- **Date**: 2026-07-21
- **Verdict**: APPROVED (with 2 low-impact warnings for future polish)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — failure_count read-modify-write race in sendPushToUser

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Data Safety
- **Location**: src/lib/push.ts:74-80
- **Detail**: On non-410/404 failures, code reads current `failure_count` then writes `count + 1`. Concurrent failing sends to same subscription can both read the same value and both write count+1, losing one increment. Soft metric; per-user push volume ~5 devices max. Real race, easily fixed.
- **Fix**: Replace read+write with atomic Postgres increment via a small SQL RPC (`bump_push_failure(sub_id uuid)`), OR accept the race — soft-metric drift is acceptable at this scale.
- **Decision**: SKIPPED — accepted the race at v1 scale (5-10 users, ~5 devices each = negligible concurrent-failure probability). Revisit if metrics ever become load-bearing.

### F2 — subscribe.ts doesn't validate expiration_time is a finite number

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/push/subscribe.ts:35
- **Detail**: `typeof expirationTime === "number"` is true for NaN and Infinity. Passing NaN produces `new Date(NaN).toISOString()` → throws → 500. Only a caller sending garbage can trigger this; only breaks their own row — no cross-user impact.
- **Fix**: Tighten to `Number.isFinite(expirationTime)`; on false, coerce to null.
- **Decision**: FIXED — subscribe.ts:35 now uses `Number.isFinite(expirationTime)` and casts to number only after the finite check.

### F3 — VAPID env vars declared optional:true instead of optional:false (planned)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: astro.config.mjs:37-48
- **Detail**: Plan Phase 2 §2 required `optional: false` for all four VAPID vars. Implementation shipped `optional: true` with an inline comment justifying the DX choice — helper `ensureVapidConfigured()` in push.ts:30 handles missing keys and throws only when a push is attempted. Deliberate deviation, documented, functionally equivalent. Not a bug; a contract drift.
- **Fix**: Update plan as an addendum documenting the DX choice.
- **Decision**: SKIPPED — deliberate deviation with inline rationale comment in astro.config.mjs; not worth re-editing plan post-implement. The comment in the code is the source of truth for future readers.

### F4 — Three unplanned files touched (eslint.config.js, .env.example, Topbar.astro)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js, .env.example, src/components/Topbar.astro
- **Detail**: eslint.config.js added `{ ignores: ["public/**"] }` (necessary for sw.js to lint clean); .env.example documented VAPID vars (docs-only, no secrets); Topbar.astro added "Notifications"/"Install" nav link mid-Phase-3 (commit 33cd3b5) because installed PWA had no way to reach /install without address bar — real UX gap the plan didn't anticipate.
- **Fix**: No action needed — all three additions are correct and defensible. For plan-hygiene: update plan as an addendum noting these required side-effects.
- **Decision**: SKIPPED — additions are correct as shipped; git history + commit messages (esp. 33cd3b5 for Topbar) are sufficient provenance.

### F5 — No failure_count-based prune for perma-failing non-410 subscriptions

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Data Safety
- **Location**: src/lib/push.ts:69
- **Detail**: Only 404/410 responses trigger a subscription delete. If a push service returns 400 or 403 permanently (rare but possible for malformed/revoked subs), the row's `failure_count` climbs forever without cleanup. At 5-10 users this won't hurt anything, but at scale it accumulates.
- **Fix**: Add a prune step in `sendPushToUser` ("if failure_count >= 5 after this send, delete"), OR a periodic cleanup cron. Both out of scope for F-02. Worth capturing as a follow-up or lesson.
- **Decision**: ACCEPTED-AS-RULE — appended entry #5 to context/foundation/lessons.md ("Cap failure_count and prune rows tracking external-endpoint state"). Fix intentionally NOT applied to F-02 code (scale doesn't warrant it); rule captured for future changes.
