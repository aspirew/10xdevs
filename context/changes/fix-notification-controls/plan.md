# Fix Notification Controls Implementation Plan

## Overview

The `NotificationControls` island on `/install` has two shipped-UI defects: (1) the "Unsubscribe this device" button uses shadcn's `outline` variant, which resolves to `bg-background` — identical to the dark-green card underneath — so the button looks like floating text with no chrome; (2) a "Send test notification" button (added during F-02 bring-up) still ships. This plan makes the unsubscribe button visibly match the project's existing outline convention and removes the full test-notification chain (UI + lib fn + endpoint).

## Current State Analysis

- `src/components/NotificationControls.tsx:122` — Unsubscribe button uses `<Button variant="outline" ...>`. Under the current theme (`--background = oklch(0.22 0.045 150)` dark green), `outline` sets `bg-background` and inherits text color; the button background is identical to the card the button sits inside.
- `src/components/NotificationControls.tsx:15-20, 26, 54, 58-65, 118-125, 126-131` — test-notification affordance: `TestResult` interface + `testResult` state + `handleTest` handler + wrapper button ("Send test notification") + result paragraph.
- `src/lib/push-client.ts:93-101` — `sendTestPush()` helper (only caller: NotificationControls).
- `src/pages/api/push/test.ts` — endpoint invoked only by `sendTestPush()`. No other consumers in the repo.
- Project convention for visible outline buttons on this theme: `border-amber-100/20 bg-amber-100/10 text-amber-50 hover:bg-amber-100/20` — used consistently in `GroupCalendar.tsx` for the Prev/Today/Next nav buttons. Matches the amber card wrapping the island.
- `/install` page copy (`src/pages/install.astro`) does not mention "test" — safe to remove without copy edits.
- No test files, no automated test runner (consistent with prior slices).

### Key Discoveries

- The shadcn `outline` variant's `bg-background` collides with the card's background on this specific theme. The rest of the shadcn palette (default, secondary, destructive) all have explicit `bg-*` values distinct from `--background` — outline is the only variant that inherits the surface color. Using the project's own amber-tinted outline pattern (rather than a different shadcn variant) matches what GroupCalendar's nav uses and stays visually consistent.
- Removing the test button orphans the entire chain because both `sendTestPush` and `/api/push/test.ts` have no other callers. Leaving them as "debug convenience" adds no value on prod and hides dead-code — the F-02 impl-review would flag them.

## Desired End State

- On `/install`, when subscribed, the user sees exactly one button: "Unsubscribe this device". The button has a visible amber-tinted background + amber border + light amber text, matching the calendar Prev/Next buttons visually. Hovering intensifies the amber tint (mirrors nav convention).
- The "Send test notification" button, its result paragraph, and its handler are gone. The `subscribed` return branch of NotificationControls is a `<div class="flex flex-col gap-2">` containing the wrapper `<div class="flex flex-wrap gap-2">` with just the Unsubscribe button, plus the error paragraph (unchanged).
- `src/lib/push-client.ts` no longer exports `sendTestPush`; the file is smaller by one function.
- `src/pages/api/push/test.ts` is deleted from the repo.
- No `/install` page copy changes; the surface reads naturally with just the enable/unsubscribe affordance.
- All existing NotificationControls behavior (getPushStatus refresh on visibilitychange, subscribeCurrentUser flow, unsubscribeCurrentUser flow, error surfaces, permission-denied / not-standalone / unsupported branches) is unchanged.

Verification: on a Vercel Preview / prod deploy, `/install` renders the "Unsubscribe this device" button with a clearly visible amber tint; no "Send test notification" button appears anywhere. `grep -rn "sendTestPush\|/api/push/test" src/` returns zero hits.

## What We're NOT Doing

- No copy change on `/install` — install-page instructions still talk about enabling notifications after installing; nothing there references "test push".
- No new confirmation dialog on unsubscribe. Trivially reversible ("Enable notifications" is one click away); friction without benefit at friend-group scale.
- No layout change to the wrapper — `flex flex-wrap gap-2` works fine around a single button and would become moot if a second button ever returns.
- No change to the `Enable notifications` (subscribe) button, which uses the default (primary) variant and is already visible.
- No change to `getPushStatus` / `subscribeCurrentUser` / `unsubscribeCurrentUser`.
- No change to the service worker (`public/sw.js`), the manifest, or any F-02 primitive beyond deleting the test endpoint.
- No new tests (consistent with S-02/S-03/F-02 pattern — manual smoke).
- No move to `variant="destructive"` for unsubscribe. Semantically debatable, and this project's own outline pattern is more visually consistent than a red button in an amber theme.

## Implementation Approach

Single phase. Three files touched: one edit + one edit + one deletion. No ordering constraint between them beyond "delete the endpoint last so the git rm shows in the final commit rather than mid-flight". Verify via typecheck + lint + build, then manual smoke on `/install` in a Vercel Preview.

## Phase 1: Visible unsubscribe button + test-notification chain removal

### Overview

Update NotificationControls to (a) render the Unsubscribe button with a visible amber-tinted className and (b) remove all test-notification code paths. Trim `push-client.ts` correspondingly and `git rm` the `/api/push/test.ts` endpoint. All edits land in one commit.

### Changes Required

#### 1. NotificationControls — visible unsubscribe + test removal

**File**: `src/components/NotificationControls.tsx`

**Intent**: Give the Unsubscribe button a visible chrome that matches the project's amber-outline convention (from GroupCalendar's nav buttons). Remove the test-notification affordance entirely: button, handler, imports, state, interface, result paragraph.

**Contract**:
- Remove `sendTestPush` from the import list at `:5-9`; leave the other imports intact.
- Delete the `TestResult` interface at `:15-20`.
- Delete `const [testResult, setTestResult] = useState<TestResult | null>(null);` at `:26`.
- In `handleUnsubscribe`, delete the `setTestResult(null);` line at `:54`.
- Delete the `handleTest` handler at `:58-65`.
- In the `status === "subscribed"` return block (around `:116-134`), delete the `<Button onClick={() => void handleTest()}...>Send test notification</Button>` and the `{testResult && !testResult.error && (...)}` result paragraph. Keep the wrapper `<div className="flex flex-wrap gap-2">` and the outer `<div className="flex flex-col gap-2">` and the `{error && ...}` line.
- Change the Unsubscribe button:
  - Drop `variant="outline"` (delete the prop).
  - Add `className="border border-amber-100/20 bg-amber-100/10 text-amber-50 hover:bg-amber-100/20"`. This overrides the default shadcn variant styling with the project's amber-outline pattern (matches `GroupCalendar.tsx` prev/today/next buttons for visual consistency).
- Ensure `useState` is still imported (it's still used for `status`, `busy`, `error`).

#### 2. push-client — remove sendTestPush

**File**: `src/lib/push-client.ts`

**Intent**: Delete the `sendTestPush` helper. Only caller was the test button; with the button gone this is orphaned.

**Contract**: Delete the `export async function sendTestPush()...` block starting at `:93` and running to the closing brace (a few lines). Leave all other exports (`PushStatus`, `getPushStatus`, `subscribeCurrentUser`, `unsubscribeCurrentUser`, `PushResult`) untouched.

#### 3. Remove test endpoint

**File**: `src/pages/api/push/test.ts` (delete)

**Intent**: The endpoint has no callers left after Change 2. Delete it via `git rm`.

**Contract**: `git rm src/pages/api/push/test.ts`.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes (dead-code removal should be net-negative complexity)
- `npm run lint` passes
- `npm run build` succeeds
- `grep -rn "sendTestPush" src/` returns zero hits
- `grep -rn "\"/api/push/test\"" src/` returns zero hits
- `ls src/pages/api/push/` does not include `test.ts`

#### Manual Verification

- Vercel Preview: `/install` while subscribed renders exactly one button ("Unsubscribe this device") with a visible amber-tinted background + amber border + light amber text; the button reads clearly against the surrounding card
- Hovering the button intensifies the amber tint (matches nav-button hover behavior)
- No "Send test notification" button appears in any status branch
- Clicking Unsubscribe: unsubscribe fires, page transitions to "Enable notifications" state (subscribe branch), no test-result paragraph appears anywhere
- Re-enabling via "Enable notifications" works as before (S-03 regression check)
- iOS PWA + Android PWA both show the visible unsubscribe button correctly
- No console errors on `/install` load or button click
- Tag production deploy as `prod-<date>-fix-notification-controls` after production smoke passes

**Implementation Note**: After Phase 1 lands and manual verification passes, this slice is complete.

## Testing Strategy

### Manual Testing Steps

1. Preview or prod deploy → `/install` → sign in → follow install instructions on a phone → open PWA → enable notifications.
2. From the subscribed state, screenshot the button: verify amber tint + visible border + readable text.
3. Click Unsubscribe → verify page transitions to "Enable notifications" branch cleanly (no lingering test-push copy).
4. Re-enable → repeat the subscribe/unsubscribe cycle once to verify no state leaks.
5. Repeat on both iOS Safari (installed PWA) and Android Chrome.

## References

- Ticket source: `context/changes/fix-notification-controls/change.md`
- F-02 archive (introduced the test button + endpoint): `context/archive/2026-07-21-pwa-shell-and-push-delivery/plan.md`
- Project outline-button convention: `src/components/GroupCalendar.tsx` (Prev/Today/Next buttons around `:175-195`)
- Component under edit: `src/components/NotificationControls.tsx`
- Endpoint under deletion: `src/pages/api/push/test.ts`
- Lib fn under deletion: `src/lib/push-client.ts:93-101` (`sendTestPush`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Visible unsubscribe button + test-notification chain removal

#### Automated

- [x] 1.1 `npm run typecheck` passes
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` succeeds
- [x] 1.4 `grep -rn "sendTestPush" src/` returns zero hits
- [x] 1.5 `grep -rn "\"/api/push/test\"" src/` returns zero hits
- [x] 1.6 `ls src/pages/api/push/` does not include `test.ts`

#### Manual

- [x] 1.7 `/install` subscribed state renders exactly one button, "Unsubscribe this device", with visible amber-tinted chrome
- [x] 1.8 Hovering the button intensifies the amber tint
- [x] 1.9 No "Send test notification" button appears in any status branch
- [x] 1.10 Click Unsubscribe → transitions to "Enable notifications" state; no test-result paragraph appears
- [x] 1.11 "Enable notifications" re-subscribe path still works (S-03 regression check)
- [x] 1.12 iOS PWA + Android PWA both show the visible unsubscribe button correctly
- [x] 1.13 No console errors on `/install` load or button click
- [x] 1.14 Tag production deploy as `prod-<date>-fix-notification-controls` after production smoke passes
