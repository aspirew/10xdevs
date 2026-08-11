# Compact Time-Slots Table Implementation Plan

## Overview

The `GroupCalendar.tsx` availability grid is currently 28 days × 16 hours = 448 cells with hover tooltips on every cell and a multi-line hint paragraph above it. On a phone the table scrolls in both axes and the hint text takes ~3 lines before the grid becomes visible. This plan shrinks the grid to 7 days × 11 hours (77 cells — 5.8× smaller), removes per-cell browser tooltips, and drops the how-to hint paragraph. The compact status line, aria-labels, and the S-03 ✓ confirm column all stay. SSR fetch shrinks to match.

## Current State Analysis

- `src/components/GroupCalendar.tsx:36` — `WINDOW_DAYS = 28`
- `src/components/GroupCalendar.tsx:40-41` — `VISIBLE_HOUR_START = 8`, `VISIBLE_HOUR_END = 24` (loop uses `h < END`)
- `src/components/GroupCalendar.tsx:177,193` — Prev/Next buttons use hardcoded `-7`/`+7` days, coincidentally equal to a quarter of the current window
- `src/components/GroupCalendar.tsx:201-206` — the hint paragraph: date range + group size + threshold reminder + "tap an hour to mark…" + conditional "tap the ✓…" tail
- `src/components/GroupCalendar.tsx:288` — `title={label}` HTML attribute on every availability cell (browser hover tooltip)
- `src/components/GroupCalendar.tsx:323` — `title={\`Confirm session at ${myStart}:00\`}` on the ✓ button
- `src/pages/groups/[id].astro:85` — SSR pre-fetch window hardcoded as `addDays(today, 27)` (= WINDOW_DAYS - 1); the initial `AvailabilityWindow` payload sent to the client covers 4 weeks — an implicit duplicate of GroupCalendar's `WINDOW_DAYS`, silently drift-prone
- `src/lib/calendar.ts` — shared calendar helpers (`formatDate`, `parseDate`, `addDays`, `buildWindow`, `isPastSlot`, `isIsoDate`, `formatSlotLabel`); natural home for a shared `WINDOW_DAYS` constant
- `aria-label` on both availability cells (`:284`) and the confirm button (`:322`) — a11y, not "hints"; must stay

## Open Risks & Assumptions

- **Pre-existing marks outside the new visible hour range (hours 0–9, 21–23) stay in the database.** The `availability` table's `slot_hour` check constraint still accepts 0–23. Marks outside 10–20 continue to contribute to overlap counts at visible cells via the start-hour semantic (`slot_hour <= h`), but users have no UI cell to toggle those specific start-hours off. Accepted risk at friend-group scale: (a) validating with real accounts whose marks are unlikely to fall in this narrow band, (b) fix if it bites is either a data cleanup or a widened visible range, not a schema change.
- **Assumption: S-02 threshold-highlight and S-03 star badge render correctly at the smaller column count.** Verified during manual smoke; no reason to expect regression, but a smaller grid could accidentally clash with existing CSS on narrow screens.
- **The Vercel serverless region runs UTC.** The seven-day visible window is offset by the server's clock, not the group's local clock — same behavior as S-02 and S-03 (documented in PRD §Non-Goals under single-TZ). No new exposure from this change.

## Desired End State

- Table renders 7 columns of days × 11 columns of hours (10:00 through 20:00 inclusive) = 77 interactive cells.
- Prev/Next navigation shifts by 7 days (one whole window at a time).
- No `title` attribute on any table cell or on the ✓ button — browser tooltips are gone.
- The multi-line "tap an hour to mark…" hint paragraph is gone. A compact one-line status line remains: `{start} → {endStr} · N members · highlight at ≥ threshold/groupSize available`.
- SSR initial fetch loads exactly the visible window (`addDays(today, 6)`) — no wasted bytes for rows the UI won't render on first paint.
- All existing behaviors preserved: S-02 tap-to-toggle availability, S-02 threshold highlight, S-03 ✓ button column, S-03 confirm dialog, star badge on confirmed cell, non-host column-hide, past-slot disable, optimistic UI + revert, week navigation.

Verification: mobile viewport (375px) shows the whole visible-hours range without horizontal scroll (or with minimal scroll); the vertical footprint above the table shrinks from ~4 lines to ~1 line; no hover tooltip appears when hovering over cells on desktop.

### Key Discoveries

- Nav-step / window-days coupling: with `WINDOW_DAYS = 7`, keeping the hardcoded `±7` in the nav handlers happens to still mean "shift by one window." Switching the literal `7` to `WINDOW_DAYS` in the same phase costs one line and removes a drift hazard for future window-size changes.
- The status line at `:201-206` is a summary (start/end dates, group size, threshold), NOT a hint. Keeping it preserves the threshold reminder — the user asked to remove hints, not the summary.
- Both `title` attributes to strip carry accessibility redundancy — the same information is already in `aria-label`. Screen reader UX is unaffected.

## What We're NOT Doing

- No refactor of the calendar into a table with sticky headers / CSS grid / virtualized rows.
- No change to the underlying data model (availability table, `getAvailabilityWindow` helper, or the `slot_hour` semantic).
- No change to the API endpoint contract (`GET /api/groups/[id]/availability?start&end`).
- No removal of `aria-label` attributes (accessibility stays intact).
- No removal of the compact status line above the table (only the multi-line hint paragraph goes).
- No adjustment to the confirm-session dialog UX or the star badge rendering on confirmed cells.
- No behaviour change to the nav buttons themselves — same Prev/Today/Next affordance; only the day step's literal is refactored to derive from `WINDOW_DAYS`.
- No change to the mobile CSS beyond what the smaller grid naturally saves.

## Implementation Approach

Single phase, three files touched (one main + one astro + no new files). The changes are independent line-level edits with no ordering constraints beyond "constants first so the loop that reads them is consistent." Verify via typecheck + lint + build + a manual smoke on a phone viewport in Chrome DevTools.

## Phase 1: Compact table + strip inline hints

### Overview

Shrink the window constants, refactor the nav step to derive from `WINDOW_DAYS`, remove per-cell `title` attributes and the hint paragraph, and shrink the SSR pre-fetch window to match. All edits land in one commit.

### Changes Required

#### 1. Compact window constants and nav step

**File**: `src/components/GroupCalendar.tsx`

**Intent**: Shrink the visible time-slots grid to 7 days × 11 hours (10:00–20:00 inclusive). Derive the nav step from `WINDOW_DAYS` so future window changes don't need two edits. Import `WINDOW_DAYS` from `src/lib/calendar.ts` (see Change 5 below) so the SSR fetch in `groups/[id].astro` shares a single source of truth.

**Contract**:
- Remove the local `const WINDOW_DAYS = 28`; instead `import { WINDOW_DAYS } from "@/lib/calendar"` alongside the existing `addDays, formatDate, parseDate, isPastSlot` imports.
- `VISIBLE_HOUR_START = 10` (was 8) — stays local to this file (component-specific render choice).
- `VISIBLE_HOUR_END = 21` (was 24 — closed-both-ends interpretation: loop `h < END` yields hours 10..20 inclusive = 11 columns).
- Prev button: `addDays(parseDate(start), -WINDOW_DAYS)` (was hardcoded `-7`).
- Next button: `addDays(parseDate(start), WINDOW_DAYS)` (was hardcoded `+7`).
- Update the leading comment at `:35` to reflect the new "1-week window" semantic (or delete it — the constant now lives in calendar.ts with its own comment).
- Update the leading comment at `:37-39` to reflect the new 10:00–20:00 range and the mobile rationale.

#### 2. Remove per-cell tooltips

**File**: `src/components/GroupCalendar.tsx`

**Intent**: Drop browser hover tooltips on availability cells and the ✓ confirm button. Keep aria-labels for screen readers.

**Contract**:
- Remove the `title={label}` prop from the availability `<td>` at `:288`.
- Remove the `title={\`Confirm session at ${myStart}:00\`}` prop from the ✓ button at `:323`.
- Leave the `aria-label` attributes on both elements untouched.

#### 3. Drop the how-to hint paragraph

**File**: `src/components/GroupCalendar.tsx`

**Intent**: Remove the multi-line "tap an hour to mark…" / "tap the ✓…" onboarding hints. Keep the one-line status summary that shows the window's date range, group size, and threshold.

**Contract**: Rewrite the paragraph at `:201-206` to a single line:
`{start} → {endStr} · {data.groupSize} {data.groupSize === 1 ? "member" : "members"} · highlight at ≥ {data.threshold}/{data.groupSize} available`
The conditional "tap the ✓ at the right of a day…" tail is removed with the rest. The paragraph classes stay identical (`className="mb-3 text-xs text-amber-100/60"`).

#### 4. Shrink SSR fetch window

**File**: `src/pages/groups/[id].astro`

**Intent**: Match the SSR initial fetch to the new 7-day visible window so the first paint doesn't ship 3 extra weeks of availability data the calendar won't render. Import `WINDOW_DAYS` from `src/lib/calendar.ts` so this file and `GroupCalendar.tsx` share the same source of truth (no magic number drift).

**Contract**: Add `WINDOW_DAYS` to the existing `import { addDays, formatDate, formatSlotLabel } from "@/lib/calendar"` at `:9`. Change `addDays(today, 27)` at `:85` to `addDays(today, WINDOW_DAYS - 1)`. Everything else on the SSR path stays identical — same helper call, same prop shape into `<GroupCalendar>`.

#### 5. Extract WINDOW_DAYS to shared calendar helpers

**File**: `src/lib/calendar.ts`

**Intent**: Give both consumers (GroupCalendar.tsx render loop + groups/[id].astro SSR fetch) a single source of truth for the visible-window size. Prevents the two files from drifting the next time the window changes. Natural home because calendar.ts already houses the shared date helpers both files use.

**Contract**: Add one exported const near the top of the file (before the helper functions):
- `export const WINDOW_DAYS = 7;`

Include a short leading comment noting: "Visible calendar window length in days. Used by GroupCalendar (render + nav step) and by groups/[id].astro (SSR initial availability fetch). Bump both consumers in one place if the window changes."

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds

#### Manual Verification

- On desktop Chrome at `/groups/<id>`: table renders 7 day rows × 11 hour columns; hour column headers are `10, 11, …, 20`
- Prev button shifts the window one week back; Next button shifts it one week forward; Today resets to the current week
- Hovering any availability cell no longer produces a browser tooltip; hovering the ✓ button no longer produces one either
- The paragraph above the grid is one line and reads `{date-range} · N members · highlight at ≥ threshold/groupSize available` — no "tap an hour" text
- Mobile viewport (375px, Chrome DevTools iPhone SE): grid fits without vertical scroll above it; horizontal scroll (if any) covers only the hour columns; no scrolled-off hint text at the top
- S-02 tap-to-toggle still works on future cells
- S-03 ✓ button still appears on days you've marked (when applicable) and opens the confirm dialog
- Screen reader (or `document.querySelector('td[aria-label]').getAttribute('aria-label')` in DevTools console) still returns the accessible label
- Confirmed session ★ badge still renders on the confirmed cell inside the visible window
- SSR HTML source of `/groups/<id>` (View Source) contains availability data for at most 7 days
- Prod smoke on `https://10xdevs-lilac.vercel.app` after push confirms all of the above under the real hosting path

## Testing Strategy

### Manual Testing Steps

1. `npm run dev`, open `/groups/<id>` in Chrome at desktop viewport → verify grid dimensions + hour headers.
2. Click Prev/Today/Next → verify week-level nav.
3. DevTools → toggle device toolbar → iPhone SE (375×667) → verify grid fits and no leading hint paragraph consumes vertical space.
4. Hover any availability cell → no browser tooltip.
5. Tap a future cell → mark works; ✓ button appears; click ✓ → dialog opens.
6. `curl -s http://localhost:4321/groups/<id> | grep -c "slot_hour" | head -1` — approximate sanity check on payload size (should be ~4× smaller than pre-change).
7. Push to main → wait for Vercel deploy → repeat 1–5 on prod.

## Performance Considerations

- SSR payload for `/groups/<id>` shrinks by roughly 4× (`7/28`) on the availability rows — a small measurable win for mobile TTFB.
- Fewer rendered cells (77 vs 448) reduces initial render + hydration cost. Not measured; not expected to be user-visible.
- Nav clicks still fetch a fresh 7-day window from the API (`/api/groups/[id]/availability`) — same round-trip cost as before, just with a smaller payload.

## References

- Ticket source: `context/changes/compact-time-slots-table/change.md`
- S-02 archive (calendar mechanics): `context/archive/2026-06-04-mark-availability-with-overlap/plan.md`
- S-03 archive (banner + ✓ button preserved by this change): `context/archive/2026-07-22-confirm-session-with-push-notification/plan.md`
- Current calendar: `src/components/GroupCalendar.tsx` (lines cited above)
- SSR entry: `src/pages/groups/[id].astro:85`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Compact table + strip inline hints

#### Automated

- [x] 1.1 `npm run typecheck` passes
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` succeeds

#### Manual

- [ ] 1.4 Desktop `/groups/<id>`: 7 day rows × 11 hour columns; headers 10..20
- [ ] 1.5 Prev / Today / Next nav shifts by exactly one week
- [ ] 1.6 No browser tooltip on any availability cell or on the ✓ button
- [ ] 1.7 Above-grid paragraph is a single line: date-range · N members · threshold reminder — no "tap an hour" text
- [ ] 1.8 Mobile viewport 375px: grid fits without pre-grid hint paragraph consuming vertical space
- [ ] 1.9 S-02 tap-to-toggle still works on future cells
- [ ] 1.10 S-03 ✓ button still appears + opens the confirm dialog on marked days
- [ ] 1.11 Aria-labels still populated on availability cells + confirm button (screen-reader / DevTools inspection)
- [ ] 1.12 Confirmed-session ★ badge still renders on the confirmed cell within the visible window
- [ ] 1.13 SSR payload for `/groups/<id>` contains at most 7 days of availability rows
- [ ] 1.14 Prod smoke on `https://10xdevs-lilac.vercel.app` after push confirms all of the above
