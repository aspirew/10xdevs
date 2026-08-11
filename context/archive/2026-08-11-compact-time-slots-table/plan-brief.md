# Compact Time-Slots Table — Plan Brief

> Full plan: `context/changes/compact-time-slots-table/plan.md`

## What & Why

The GroupCalendar availability grid (28 days × 16 hours = 448 cells) is too big on mobile and clutters onboarding with per-cell browser tooltips + a multi-line hint paragraph. Compact the visible surface to 7 days × 11 hours (77 cells — 5.8× smaller), drop the tooltips and the hint paragraph, keep the compact status line + accessibility labels + S-03 ✓ button intact. SSR fetch shrinks in lock-step.

## Starting Point

`src/components/GroupCalendar.tsx` renders a 28-day × 16-hour grid with `WINDOW_DAYS = 28`, `VISIBLE_HOUR_START/END = 8/24`, hardcoded `±7` nav step, `title` attributes on every cell, and a multi-line hint paragraph explaining tap-to-mark + ✓-to-confirm. `src/pages/groups/[id].astro:85` pre-fetches 28 days SSR-side. The rest of the calendar behavior (S-02 tap-to-toggle, S-03 confirm ✓, banner, ★ badge, non-host column hide, past-slot disable) is untouched by this change.

## Desired End State

`/groups/<id>` renders a 7-day × 11-hour grid (hours 10–20 inclusive). Nav step = one whole week. No browser hover tooltips anywhere in the table. Above the grid: a single compact line showing date range, group size, and threshold reminder. Aria-labels stay for screen readers. SSR sends only 7 days of availability rows. All existing behaviors — mark/unmark, confirm, banner, badge — work identically.

## Key Decisions Made

| Decision                     | Choice                                                                                              | Why (1 sentence)                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hour range endpoint          | Closed-both-ends 10..20 (11 columns; `VISIBLE_HOUR_END = 21` under `h < END` loop)                  | Reads as "10 through 8pm" naturally; preserves evening board-game slot (8pm start) that a half-open range would cut.                                          |
| Days visible                 | 7 (one calendar week)                                                                               | Matches the ticket's "~7" literally; each Prev/Next click reveals a full new week; nav step already = 7 so no additional logic needed.                        |
| Hint-removal scope           | Strip cell `title` attrs + drop the multi-line hint paragraph; keep the compact status line + aria-labels | Onboarding text goes; summary info (date range + threshold) stays; accessibility stays intact.                                                                |
| SSR fetch window             | Match visible window (`addDays(today, 6)`)                                                          | Single source of truth for window size; ~4× smaller SSR payload; nav Next always refetches anyway, so no perceived UX regression at friend-group scale.       |
| Nav step derivation          | Switch `±7` literal in Prev/Next handlers to `±WINDOW_DAYS`                                          | Zero-cost drift prevention; if the window changes again the nav step follows automatically.                                                                   |
| WINDOW_DAYS home             | Extract to `src/lib/calendar.ts` as an exported const; both GroupCalendar.tsx and groups/[id].astro import it | Single source of truth across the file boundary — closes the same drift class the nav-step fix addresses; calendar.ts already houses shared date helpers.       |

## Scope

**In scope:**
- New exported `WINDOW_DAYS` const in `src/lib/calendar.ts`
- 2 constants stay local in `GroupCalendar.tsx` (VISIBLE_HOUR_START, VISIBLE_HOUR_END); `WINDOW_DAYS` becomes an import
- 2 nav-button day steps (Prev/Next handlers) → `±WINDOW_DAYS`
- Remove 2 `title` attributes (availability cell + ✓ confirm button)
- Rewrite the hint paragraph to a single status line
- Shrink SSR fetch window in `groups/[id].astro` to `addDays(today, WINDOW_DAYS - 1)`

**Out of scope:**
- Any change to the availability schema, endpoint contracts, or `getAvailabilityWindow` helper
- Refactor of the table into CSS grid / sticky headers / virtualization
- Any change to the confirm dialog, ★ badge, non-host column-hide, or optimistic UI on toggle
- Aria-label removal (accessibility stays)
- Removal of the status line above the grid (it's a summary, not a hint)

## Architecture / Approach

Three files touched (`src/lib/calendar.ts` gets one exported const; `GroupCalendar.tsx` swaps a local const for an import + tweaks two others + a paragraph; `groups/[id].astro` swaps a magic number for the same import). No new modules, no new deps, no schema. `WINDOW_DAYS` in `calendar.ts` is the single source of truth for both the render loop and the SSR fetch window, so future window bumps require exactly one edit.

## Phases at a Glance

| Phase                                     | What it delivers                                                                                | Key risk                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1. Compact table + strip inline hints     | 7×11 grid, no tooltips, single-line status, SSR fetches 7 days                                  | Someone had marked availability at hour 8 or 9 (now hidden); their mark still counts server-side but doesn't render.  |

**Prerequisites:**
- S-02 and S-03 archived and live on production (both ✓ done).
- Dev environment builds/lints/typechecks cleanly (verified before starting).

**Estimated effort:** ~1 focused session (~30 min including manual smoke on mobile viewport + prod verification).

## Open Risks & Assumptions

- **Users with pre-existing marks outside 10–20:** the data model still stores hours 0–23 (`slot_hour` check constraint hasn't changed). Marks at hour 8 or 22 remain in the database and still contribute to overlap counts at cells within the visible range (start-hour semantic: `slot_hour <= visible_h`). They just don't have a visible cell to toggle. This is acceptable because: (a) at friend-group scale we're validating with real accounts whose marks are unlikely to fall in this narrow band, (b) if it becomes a real annoyance the fix is a data cleanup or widening the visible range, not a schema change.
- **The Vercel serverless region ships `formatDate(new Date())` in UTC:** the seven-day visible window is offset by the server's clock, not the group's local clock — same behavior as S-02 and S-03 (documented in PRD §Non-Goals under single-TZ). No new exposure from this change.
- **Assumption: the S-02 threshold-highlight rule and the S-03 star badge look correct in the narrower grid** — no visual regression from the smaller column count. Verified during manual smoke.

## Success Criteria (Summary)

- On a phone-viewport dev tool, the `/groups/<id>` availability grid fits without pre-grid vertical clutter and shows a full week of overlapping availability at a glance.
- On desktop, hovering cells produces no browser tooltips; the paragraph above the grid is one line.
- Every prior interaction (mark/unmark, confirm, banner render, ★ badge, non-host hide) works identically.
- SSR page source contains at most 7 days of availability rows.
