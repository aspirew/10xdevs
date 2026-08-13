# Rename Notifications → Settings + Drop Signed-Out Install — Plan Brief

> Full plan: `context/changes/rename-notifications-and-drop-install/plan.md`

## What & Why

The signed-in Topbar's "Notifications" label undersells the destination — the `/install` page actually covers both install instructions AND notification prefs. Rename it to "Settings" (menu + page hero + browser tab title, all consistent). Also drop the signed-out Topbar's "Install" link entirely — signed-out visitors don't need a shortcut to that surface yet; a proper PWA install prompt can live on the landing page later.

## Starting Point

`src/components/Topbar.astro` has two auth-state branches. Signed-in: `[logo] | Groups | Notifications | Sign out`. Signed-out: `[logo] | Install | Sign in | Sign up`. Both "Notifications" and "Install" link to `/install`. `src/pages/install.astro` uses `title="Install GameSlot"` and h1 `Install GameSlot`, with three cards: install instructions, notifications card, NotificationControls island.

## Desired End State

Signed-in nav: `[logo] | Groups | Settings | Sign out`. Signed-out nav: `[logo] | Sign in | Sign up` (no Install). The `/install` route stays; the page's browser tab title reads "GameSlot Settings" and its hero h1 reads "Settings". All install-instruction cards + notification affordances still render — they're just now under the "Settings" umbrella.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Rename scope | Menu label + page hero h1 + Layout title (route stays `/install`) | Consistent UX — click "Settings" → arrive at "Settings"; no redirect churn. |
| New page label | "Settings" | Matches the menu; concise; friend-group scale doesn't need finer nuance. |
| What stays on the Settings page | Everything — install instructions + NotificationControls | Both are settings-adjacent; one destination for both keeps discovery simple. |
| Signed-out Install link | Drop entirely | Ticket-explicit; a proper PWA prompt on the landing page is out of scope. |
| Legacy `/install` URL | No redirect | Route resolves; friend-group scale has no external inbound links to worry about. |
| `next=/install` sign-in redirect | Left as-is | Code-level URL reference in `NotificationControls.tsx:87` continues to work. |
| i18n | Not adding | Strings stay inline consistent with the rest of the codebase. |

## Scope

**In scope:**
- `src/components/Topbar.astro` — swap "Notifications" → "Settings" (signed-in branch); delete the `<a href="/install">Install</a>` (signed-out branch)
- `src/pages/install.astro` — Layout title `"Install GameSlot"` → `"GameSlot Settings"`; hero h1 `"Install GameSlot"` → `"Settings"`

**Out of scope:**
- Route rename or redirect
- Page structure / cards change
- New PWA install prompt on landing
- i18n
- Automated tests
- Any other Topbar link (Groups, Sign in, Sign up, Sign out) or the logo

## Architecture / Approach

Single-phase, two-file, all string edits. Verify via typecheck + lint + build + grep sanity checks + manual smoke on `/groups` (Topbar rendered) + `/install` (page + Topbar).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rename + drop | Signed-in Settings link; signed-out Install link gone; page hero + tab title match menu | Very low — string edits with grep-verifiable success criteria. |

**Prerequisites:**
- `NotificationControls.tsx:87` still uses `next=/install` — verified in current state; no change needed since route stays.
- Dev environment builds/lints/typechecks cleanly.

**Estimated effort:** ~15 min (two files, all string edits).

## Open Risks & Assumptions

- **Assumption: nobody has bookmarked `/install` externally.** Friend-group scale, and the route is preserved anyway. Zero blast radius from the visible rename.
- **Assumption: `Settings` reads naturally as the label even though the page still has PWA install instructions.** Yes — the page is where you configure install + notifications; "Settings" is broader-yet-accurate.

## Success Criteria (Summary)

- Signed-in nav ends in `... | Settings | Sign out`; clicking Settings routes to `/install` which now presents as "Settings" in both hero and browser tab.
- Signed-out nav no longer contains an Install link.
- All install-instruction cards + NotificationControls still render on the Settings page.
- `NotificationControls.tsx`'s `next=/install` sign-in redirect still works end-to-end.
