# Landing Page + Visual Identity Refresh — Plan Brief

> Full plan: `context/changes/landing-page-refresh/plan.md`

## What & Why

The landing page still ships stock Astro-starter copy ("production-ready starter with authentication, modern tooling…" plus three feature cards about Supabase/Astro/ESLint) and the whole app runs on the starter's generic cosmic-purple palette. This ticket replaces the copy with product-accurate content grounded in the PRD and swaps the palette for a distinctive identity so GameSlot stops looking like an unedited scaffold.

## Starting Point

`src/components/Welcome.astro` has a two-word "Game Slot" hero, placeholder tagline, three dev-tooling feature cards, and a purple/blue orb-and-starfield backdrop. Fifteen files across the app reference the current cosmic-palette utilities (`bg-cosmic`, `bg-purple-*`, `text-blue-100`, `border-white/10`, etc.). shadcn CSS tokens exist in `global.css` but hold default gray values and are unused. PWA `theme_color` / `<meta name="theme-color">` = `#7c3aed`.

## Desired End State

Landing shows **GameSlot** (one word) centered as a typographic hero, a two-sentence tagline drawn from the PRD Vision (shared calendar → overlap-aware → push on confirm), and three product-accurate feature cards. Every page — auth, groups, install, invite — renders in a **"tavern warmth"** palette (deep forest green surfaces + amber/brass accents + warm cream text). The PWA install prompt and mobile status bar match the in-app look.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Palette direction | Deep forest + amber ("tavern warmth") | Board-game domain tie-in, clean break from generic-SaaS cosmic-purple, stays dark-mode-first for mobile | Plan |
| Palette scope | App-wide sweep in Phase 3 (all 15 files), not just landing | User asked for "entire app"; single-page refresh would leave visible inconsistency | Plan |
| Token strategy | Update shadcn `:root`/`.dark` CSS variables AND swap direct utilities | Tokens = future-proof for shadcn adoption; direct-utility swap = actually visible today | Plan |
| App name | "GameSlot" (one word) | Matches `manifest.webmanifest`, `<title>`, and every other reference; drop "Game Slot" | Plan |
| Feature cards | Rewrite (not remove) — three product-accurate cards | Cards frame the loop for first-time visitors; removing would leave the fold empty | Plan |
| CTAs | Keep both "Sign in" / "Sign up" | CTA consolidation is a separate auth-flow decision, out of scope here | Plan |
| Logo asset | Out of scope — typography-only | Sibling ticket `logo-links-to-landing` places a header logo; this ticket delivers the identity it will adopt | Plan |
| Manifest sync | Update `theme_color`, `background_color`, `<meta name="theme-color">` to `#12291d` (background base) | Otherwise PWA install screen and OS chrome mismatch the in-app look | Plan |
| Font | System stack — no custom display font | Self-hosting + licensing decisions belong in a separate design ticket | Plan |
| Icons (favicon, PWA icons) | Out of scope | Icon repaint can follow once palette is validated in the browser | Plan |

## Scope

**In scope:**
- Rewrite `src/components/Welcome.astro` (hero, tagline, feature cards, backdrop orbs)
- Recolor `global.css` shadcn tokens + rename `bg-cosmic` → `bg-tavern`
- Update `manifest.webmanifest` and `Layout.astro` theme-color values
- Sweep direct color utilities across ~14 non-landing files (Topbar, GroupCalendar, InstallPushBanner, NotificationControls, LibBadge, auth forms, all pages)

**Out of scope:**
- New logo mark or wordmark asset (`logo-links-to-landing` sibling ticket)
- Auth-CTA consolidation
- Custom fonts
- Icon / favicon repaint
- Notification-controls invisible-button fix (`fix-notification-controls` sibling ticket)
- Header menu label changes (`rename-notifications-and-drop-install` sibling ticket)
- Time-slot table layout (`compact-time-slots-table` sibling ticket)

## Architecture / Approach

Three linear phases, each independently reviewable:

1. **Palette + PWA metadata** — flip the design tokens, rename `bg-cosmic` → `bg-tavern` with new gradient, sync manifest + meta theme-color. Every page immediately picks up the new background.
2. **Landing rewrite** — replace copy and orb colours in `Welcome.astro`; CTAs unchanged.
3. **App-wide utility sweep** — grep-and-replace direct color utilities in the other 14 files.

The `bg-tavern` custom utility acts as the single-source recolor point for page backgrounds. Direct utilities elsewhere are replaced literal-for-literal so the diff stays reviewable in code review.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Palette + PWA metadata | New CSS tokens, `bg-tavern` utility, synced manifest/meta theme-color | Non-token surfaces (direct utilities) still look purple until Phase 3 — visually mixed intermediate state |
| 2. Landing rewrite | GameSlot hero, PRD-grounded tagline, product-accurate cards, retuned orbs | Copy phrasing may need editorial polish after seeing it live |
| 3. App-wide utility sweep | Consistent tavern palette across all 14 non-landing files | Some direct utilities may be load-bearing (e.g. GroupCalendar's overlap heat map) — needs verification that semantic ramp still reads |

**Prerequisites:** none — all edits are local; no env / migration / data changes.
**Estimated effort:** ~1–2 sessions across the three phases (mostly mechanical utility swaps in Phase 3).

## Open Risks & Assumptions

- **Palette direction is a preference call.** The plan commits to "tavern warmth" (deep forest + amber) up-front because you asked to keep moving. If it lands and reads wrong in the browser, the values live in one table in the plan and one `@utility` block — a re-tune is cheap.
- **`GroupCalendar` overlap ramp needs eye-check.** Recoloring the amber ramp needs a visual test that low-vs-high overlap counts are still clearly distinguishable. Called out in Phase 3 manual verification.
- **PWA `theme_color` cache.** Users who have GameSlot installed may not see the new OS chrome colour until the service worker refetches the manifest. Not a blocker; documented in the migration note.
- **Font stays system.** A custom display font would push the "unique" feel further but wasn't requested and would need self-hosting decisions.

## Success Criteria (Summary)

- `/` shows a GameSlot hero + product-accurate tagline + three PRD-grounded feature cards, no Astro-starter copy anywhere.
- Every route renders in the tavern palette on desktop and mobile; `grep` for the old cosmic utilities under `src/` returns zero hits (or documented exceptions).
- The PWA install prompt and mobile OS status bar take on the new `#12291d` background.
