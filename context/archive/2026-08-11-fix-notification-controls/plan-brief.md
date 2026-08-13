# Fix Notification Controls — Plan Brief

> Full plan: `context/changes/fix-notification-controls/plan.md`

## What & Why

Two shipped-UI defects on `/install`: (1) the "Unsubscribe this device" button uses shadcn's `outline` variant whose `bg-background` equals the surrounding dark-green card — button chrome is invisible, only the light amber text hints at it; (2) a "Send test notification" button ships from the F-02 bring-up days and doesn't belong in prod UI. Fix visibility with the project's own amber-outline pattern, remove the full test-notification chain.

## Starting Point

`NotificationControls.tsx` renders two buttons in the `subscribed` branch — a default-variant "Send test notification" and an `outline`-variant "Unsubscribe this device". The `outline` variant sets `bg-background` (dark green) which is identical to the surface underneath. The test chain: UI button → `sendTestPush` in `push-client.ts` → `/api/push/test.ts` endpoint. `GroupCalendar.tsx`'s Prev/Today/Next nav uses the project's convention for visible outline buttons: `border-amber-100/20 bg-amber-100/10 text-amber-50 hover:bg-amber-100/20`.

## Desired End State

`/install` in the subscribed state shows exactly one button — "Unsubscribe this device" — with an amber-tinted background + amber border + light amber text, matching the calendar's Prev/Next visually. The "Send test notification" button, `sendTestPush` helper, and `/api/push/test.ts` endpoint are all removed. Every other NotificationControls behavior (subscribe flow, permission-denied / not-standalone / unsupported branches, error surface) is unchanged.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Unsubscribe visibility fix | Custom className matching GroupCalendar's outline convention (`border-amber-100/20 bg-amber-100/10 text-amber-50 hover:bg-amber-100/20`) | Uses the project's established amber-outline pattern (already used by nav buttons) instead of introducing a different shadcn variant — visual consistency across the app. |
| Test-notification removal depth | Full chain: UI button + `sendTestPush` in push-client + `/api/push/test.ts` endpoint | No callers left after the button is gone; keeping the lib fn + endpoint as dead code adds no value on prod. |
| Layout of sole remaining button | Keep the `flex flex-wrap gap-2` wrapper as-is | Works with one button; zero-value refactor to remove. |
| Confirmation dialog on unsubscribe | Skip — no confirmation | Trivially reversible ("Enable notifications" is one click away); friction without benefit. |
| Install page copy | Leave unchanged | `/install` copy doesn't reference "test" anywhere; nothing to reword. |

## Scope

**In scope:**
- `src/components/NotificationControls.tsx` — button className fix + full test-notification removal (import, interface, state, handler, JSX)
- `src/lib/push-client.ts` — delete `sendTestPush` function
- `src/pages/api/push/test.ts` — delete file (via `git rm`)

**Out of scope:**
- `/install` page copy changes
- Confirmation dialog on unsubscribe
- Layout refactor of the buttons wrapper
- Any change to subscribe / permission-denied / not-standalone / unsupported branches
- Any change to service worker, manifest, or other F-02 primitives
- Automated tests (consistent with S-02/S-03/F-02)

## Architecture / Approach

Single-phase surgical edit across three files: one component edit (bulk of the work), one lib-file trim, one file deletion via `git rm`. No new modules, no new deps, no schema, no cross-file coordination beyond "delete the endpoint last so it shows in the same commit". Verify via typecheck + lint + build + `grep` for orphaned references + manual smoke on `/install` after Vercel Preview.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Visible unsubscribe button + test-notification chain removal | Visible amber-tinted Unsubscribe button; test button + lib fn + endpoint all removed | None material — surgical edits with straightforward grep verification. |

**Prerequisites:**
- F-02 archived and in production (✓ done 2026-07-22)
- Dev environment builds/lints/typechecks cleanly

**Estimated effort:** ~30 min (single-phase; edits are small).

## Open Risks & Assumptions

- **Assumption: no other callers of `sendTestPush` or `/api/push/test` in the repo.** Verified via `grep -rn`. If a future automated test suite references them, it doesn't exist yet.
- **Assumption: the project's amber-outline pattern from GroupCalendar renders as intended on `/install`'s card.** Same theme, same card backdrop shape — should be identical. Manual smoke verifies.
- **Post-flip theme reminder:** any hard-coded slate/gray text overrides elsewhere might still be broken; not in scope but noted.

## Success Criteria (Summary)

- On prod, `/install` in subscribed state shows one visible amber-tinted "Unsubscribe this device" button; no test button anywhere; no test-result paragraph.
- Grep verifications pass: no leftover references to `sendTestPush` or `/api/push/test` in `src/`; `test.ts` file gone.
- Unsubscribe click still transitions cleanly to the subscribe state; re-subscribe still works.
