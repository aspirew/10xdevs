# Landing Page + App-Wide Visual Identity Refresh — Implementation Plan

## Overview

Replace the generic Astro-starter landing copy with product-accurate content grounded in the PRD, and swap the current cosmic-purple palette for a distinctive "tavern warmth" identity (deep forest + amber) applied consistently across every page and PWA surface.

## Current State Analysis

- `src/pages/index.astro` renders `<Welcome />` from `src/components/Welcome.astro`. That component contains three artefacts of the Astro starter:
  1. Hero title "Game Slot" (two words) — inconsistent with `manifest.webmanifest`, `<title>`, and every other usage which say "GameSlot".
  2. Description: `A production-ready starter with authentication, modern tooling, and a cosmic developer experience.` — placeholder from the Astro starter, unrelated to the product.
  3. Three feature cards: "Authentication Ready" (Supabase), "Modern Stack" (Astro 5 / React 19 / Tailwind 4 / TS), "Developer Experience" (ESLint / Prettier / hooks) — all describe the scaffold, none describe GameSlot.
- The current palette (`bg-cosmic` utility in `src/styles/global.css:113` = linear gradient `#0a0e1a → #0f1529 → #0a0e1a`, plus purple/indigo/blue orbs and a star-field pattern in `Welcome.astro:5-25`) is a generic-modern-SaaS look inherited from the starter. Fifteen files reference the palette directly: `Welcome.astro`, `Topbar.astro`, `GroupCalendar.tsx`, `InstallPushBanner.tsx`, `NotificationControls.tsx` (via cards), `ui/LibBadge.astro`, `auth/SubmitButton.tsx`, `auth/FormField.tsx`, `auth/SignUpForm.tsx`, `signin.astro`, `signup.astro`, `install.astro`, `invite/[token].astro`, `groups/new.astro`, `groups/[id].astro`, `groups/index.astro`.
- `global.css` defines shadcn CSS tokens (`--background`, `--foreground`, `--primary`, `--accent`, `--border`, `--ring`, chart, sidebar, etc.) in `:root` and `.dark`, currently holding default neutral gray/black values. Most visible surfaces are styled with direct utility classes rather than tokens, BUT there are two live consumers: (1) `src/components/ui/button.tsx` (the shadcn `<Button>`) uses `bg-primary`, `text-primary-foreground`, `hover:bg-primary/90`, `bg-destructive`, `bg-secondary`, `bg-accent`, `focus-visible:border-ring`, `focus-visible:ring-ring/50`; and (2) `src/components/NotificationControls.tsx` uses `text-muted-foreground` and `text-destructive`. This means Phase 1's token-value flip has broader visible reach than "just the background gradient" — every `<Button variant>` instance and every `NotificationControls` render inherits the new palette automatically.
- `manifest.webmanifest` `theme_color: #7c3aed`, `background_color: #ffffff`. `Layout.astro:18` `<meta name="theme-color" content="#7c3aed" />`. Both need to sync with the new palette; otherwise the PWA install screen and OS status bar mismatch the in-app look.

## Desired End State

- Landing page has the app name **"GameSlot"** centered as a typographic hero, a two-sentence product tagline grounded in the PRD Vision, three product-accurate feature strips beneath, and the existing Sign in / Sign up CTAs preserved unchanged.
- The whole app — landing, auth pages, groups list, group detail, install, invite — renders in the **tavern warmth** palette (deep forest green surfaces, amber/brass accents, warm cream text). No purple/blue/indigo utilities remain anywhere.
- `manifest.webmanifest` `theme_color` and `<meta name="theme-color">` both point at the new primary hue so the PWA install screen and mobile status bar match the app.
- Verify by: `npm run dev` shows the new palette on `/`, `/auth/signin`, `/auth/signup`, `/groups`, `/groups/[id]`, `/install`, `/invite/[token]`; a `grep` for the old utilities (`bg-cosmic|from-blue-200|via-purple-200|from-purple-200|bg-purple-6|text-blue-100|text-purple-3`) returns zero hits under `src/`.

### Key Discoveries

- The existing `bg-cosmic` custom utility (`global.css:113-115`) is a single-source recolor point for the app background — replacing its gradient hex values cascades to every page that uses `bg-cosmic`. That's four pages currently.
- Hero and card visual language (`Welcome.astro:32-53`) uses gradient-clipped text and blurred orbs; both effects are keyed to specific Tailwind color literals (`from-blue-200 via-purple-200 to-pink-200`, `bg-purple-500/20`, etc.), not to CSS tokens. Any recolor must edit those literals inline.
- shadcn tokens (`--background`, `--primary`, etc.) exist but are dormant. Wiring them into the new palette is cheap insurance for any future shadcn/Radix component adoption but does **not** change any current pixel — this is a token hygiene bonus, not the load-bearing change.
- The `logo-links-to-landing` sibling ticket adds a clickable logo to the header. This ticket does **not** design or place a logo mark; it delivers a typographic identity that the sibling ticket can adopt.

## What We're NOT Doing

- Not consolidating the two CTAs (Sign in / Sign up) into a single "Continue with Google" button — the two-button pattern stays; auth-CTA rework belongs in an auth-flow ticket.
- Not designing a real logo mark (SVG or wordmark). The `logo-links-to-landing` sibling ticket owns the header logo.
- Not swapping the font. The system font stack stays; a custom display font would need self-hosting and licensing decisions out of scope here.
- Not adding a mobile install prompt component, changing the header/menu structure, or touching notification-controls styling — those are separate follow-up tickets.
- Not internationalising or expanding copy — the tagline lands in English, matching every other user-facing string in the repo.
- Not updating `public/favicon.png`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, or `public/icons/icon-maskable-512.png`. Icon repaint can follow the palette shift as a separate change once the palette is nailed.

## Implementation Approach

Three linear phases, ordered so each ships an independently reviewable delta:

1. **Palette + PWA metadata.** Ship the new colour language as CSS custom properties, a recoloured `bg-cosmic` (renamed to `bg-tavern`), synced `theme-color` and manifest values. No copy changes yet. After this phase the whole app has the new background/accent surfaces, but the hero copy and feature cards still say what they say today.
2. **Landing rewrite.** Rewrite `Welcome.astro` — one-word name, PRD-grounded tagline, three product-accurate feature cards, adjusted orb/starfield background so it harmonises with the new palette. CTAs untouched.
3. **App-wide utility sweep.** Grep-and-replace direct colour utilities across the fourteen non-landing files so they match the new palette. Zero-hit `grep` for the old utility set is the automated stop condition.

Rationale for splitting: Phase 1 alone is a coherent "everything got a bit warmer" change even if you pause there; Phase 2 alone is the promised landing rewrite; Phase 3 is the mechanical sweep that removes the last purple/blue traces. Each phase can be verified in the browser before moving on.

## Critical Implementation Details

**Naming — rename `bg-cosmic` to `bg-tavern`.** Every file that references `bg-cosmic` must be updated in Phase 1, not deferred to Phase 3. Leaving `bg-cosmic` as an alias would let stale references linger; the sweep in Phase 3 is for *direct utilities*, not for the custom utility name.

**Palette values (target).** Recorded here so all three phases pull from the same source. Values are OKLCH for the CSS tokens and hex for manifest/meta (which don't accept OKLCH).

| Role                 | OKLCH (dark base)             | Hex fallback | Notes                                     |
| -------------------- | ----------------------------- | ------------ | ----------------------------------------- |
| Background base      | `oklch(0.22 0.045 150)`       | `#12291d`    | Deep forest green — replaces cosmic navy  |
| Background surface   | `oklch(0.29 0.045 150)`       | `#1b3a2c`    | Card / raised surface                     |
| Foreground primary   | `oklch(0.94 0.045 85)`        | `#f5e6c8`    | Warm cream — replaces text-white          |
| Foreground muted     | `oklch(0.72 0.035 145)`       | `#a3b8a5`    | Sage — replaces text-blue-100/60          |
| Primary accent       | `oklch(0.75 0.14 75)`         | `#e0a94a`    | Amber — replaces purple-600 on CTAs       |
| Primary accent hover | `oklch(0.80 0.13 75)`         | `#f0bd63`    | Amber lift                                |
| Secondary accent     | `oklch(0.60 0.13 55)`         | `#c47a2a`    | Brass — used sparingly for chart / borders|
| Border subtle        | `rgba(245, 230, 200, 0.10)`   | —            | Cream at 10% — replaces `border-white/10` |
| Destructive          | unchanged from current `.dark`| —            | Red stays red                             |

**Two-axis colour semantics for GroupCalendar.** The existing calendar encodes two *orthogonal* meaning axes that must be preserved after the palette shift — collapsing them into one ramp destroys the interaction. The mapping is documented in `src/components/GroupCalendar.tsx:245-249` as a code comment. In the tavern palette:

| Semantic axis                            | Old (cosmic)                    | New (tavern)                                    |
| ---------------------------------------- | ------------------------------- | ----------------------------------------------- |
| YOU — your explicit start (`isMyStart`)  | `bg-blue-500/40` + `ring-blue-300` | `bg-amber-300/45` + `ring-2 ring-amber-200 ring-inset` + `font-bold` |
| YOU — in your available range (`iAmAvailable`) | `bg-blue-500/10`          | `bg-amber-300/15`                               |
| GROUP — overlap threshold met (`isHot`)  | `bg-purple-600/30` + `ring-purple-400` | `bg-emerald-500/35` + `ring-1 ring-emerald-300 ring-inset` |
| Others — someone available, not hot      | `bg-white/5`                    | `bg-amber-50/8`                                 |
| Empty slot                               | (no bg)                         | (no bg)                                         |
| Confirmed session star                   | `text-yellow-300`               | `text-amber-100` (kept high-contrast bright)    |
| Push-fail day marker                     | `ring-red-500`                  | unchanged — errors stay universal red           |
| Cell hover state                         | `hover:bg-white/10`             | `hover:bg-amber-100/10`                         |
| Cell base border + text                  | `border-white/5 text-blue-100/80` | `border-amber-100/8 text-amber-50/80`         |

**Amber = YOU. Emerald = GROUP.** The two colour families let the eye read the two axes independently, exactly as the current code intends. Do NOT map the group-overlap "hot" state onto amber — it must contrast against the personal axis, otherwise the wedge signal for FR-008 disappears.

**Confirm-button (✓) palette** — the small ✓ button at `GroupCalendar.tsx:324` is an action affordance sitting inside the cell grid; its hover/focus states must read as "group action" (emerald), matching the overlap axis:

- Base: `border-amber-100/20 bg-amber-100/10 text-amber-50`
- Hover: `hover:border-emerald-300 hover:bg-emerald-500/30`
- Focus: `focus:ring-2 focus:ring-emerald-400 focus:outline-none`

The visited-priority rules (`isMyStart > isHot > iAmAvailable > count > 0 > empty`) are unchanged — this is a colour substitution, not a logic change.

**Recurring composed effects (single-source gradients).** Two gradient patterns repeat across the codebase and must land on ONE canonical replacement each so pages stay consistent. Every Phase 3 file that touches one of these should copy the canonical string verbatim.

- **Section-heading gradient** — currently `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent`, appearing 8× across `signin.astro:11`, `signup.astro:11`, `groups/new.astro:20`, `groups/index.astro:61`, `groups/[id].astro:121` + `147`, `invite/[token].astro:51` + `75`. Canonical replacement:
  ```
  bg-gradient-to-r from-amber-200 via-amber-300 to-orange-200 bg-clip-text text-transparent
  ```
  (Same string used by the hero on `Welcome.astro` in Phase 2. One string for every branded heading in the app.)

- **Emphasis-banner gradient** — currently `bg-gradient-to-r from-purple-200 to-pink-200 bg-clip-text text-transparent`, appearing once on `groups/[id].astro:212` (nextSession banner). Canonical replacement:
  ```
  bg-gradient-to-r from-amber-300 to-orange-200 bg-clip-text text-transparent
  ```
  (Deliberately warmer/deeper than the section heading so the nextSession block still reads as emphasised.)

- **Emphasis-banner surround** — same nextSession block also uses `border-purple-400/30 bg-purple-500/15`. Canonical replacement: `border-emerald-400/30 bg-emerald-500/15` — puts the "your session is confirmed" banner in the same emerald family as the GroupCalendar's group-overlap axis, tying the two group-scope surfaces together.

**`theme-color` and manifest.** Use the **background base** hex (`#12291d`), not the accent. The `theme-color` colours the OS chrome around the PWA; matching it to the background base gives a seamless top-of-viewport transition rather than a jarring amber bar.

## Phase 1: Palette + PWA metadata

### Overview

Introduce the tavern-warmth palette as CSS tokens, rename `bg-cosmic` → `bg-tavern` with new gradient values, and sync the two theme-color declarations (manifest + meta) so the PWA install/status surfaces match.

**Phase 1 reach note.** Because the shadcn `<Button>` component and `NotificationControls` consume the tokens updated here (see Current State Analysis), the visible impact of this phase extends beyond `bg-cosmic` surfaces to every `<Button>` instance in the app — Welcome CTAs excepted since they use raw utilities, not `<Button>`. Expect `/install`'s subscribe/unsubscribe buttons and any other `<Button>` render to shift to the new amber tokens after Phase 1 lands.

**Sequencing with sibling ticket `fix-notification-controls`.** That ticket addresses an invisible white-on-white unsubscribe button. Phase 1 here will likely change how visible that button is (for better or worse) because the shadcn `<Button>`'s `variant="outline"` reads from `--background` and `--input`. Land Phase 1 of this ticket **before** starting `fix-notification-controls` so the sibling can evaluate the button against the final tavern palette, not the interim cosmic one.

### Changes Required

#### 1. Global styles — encode the new palette

**File**: `src/styles/global.css`

**Intent**: Rewire the shadcn CSS tokens in `:root` and `.dark` to the tavern palette values so any token-consuming component picks up the new identity for free, and rename `bg-cosmic` to `bg-tavern` with the new base→surface→base gradient.

**Contract**: Preserve the existing token *names* (`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--border`, `--input`, `--ring`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, plus sidebar and chart tokens); update their OKLCH values to the palette table above. Rename the `@utility bg-cosmic { … }` block to `@utility bg-tavern { background-image: linear-gradient(to bottom, #12291d, #1b3a2c, #12291d); }`. The `@theme inline` block that maps `--color-*` to `var(--*)` stays as-is.

#### 2. Layout meta theme-color

**File**: `src/layouts/Layout.astro`

**Intent**: Update the mobile status-bar tint declared by `<meta name="theme-color">` so it matches the new background base rather than the old cosmic purple.

**Contract**: `<meta name="theme-color" content="#12291d" />`.

#### 3. PWA manifest theme + background colors

**File**: `public/manifest.webmanifest`

**Intent**: Sync the manifest's `theme_color` and `background_color` to the tavern palette so the PWA install prompt and splash screen render in the new identity, not white-with-purple-bar.

**Contract**: `theme_color: "#12291d"`, `background_color: "#12291d"`. All other fields (`name`, `short_name`, `start_url`, `display`, `orientation`, `icons`) unchanged.

### Success Criteria

#### Automated Verification

- Type-checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- No `bg-cosmic` references remain in `src/`: `grep -rn "bg-cosmic" src/` returns zero hits
- New utility is defined: `grep -n "bg-tavern" src/styles/global.css` returns exactly one hit at the utility declaration

#### Manual Verification

- `npm run dev` starts cleanly; `/` renders with a deep-forest gradient background (no purple)
- All four pages using the old `bg-cosmic` (`/`, `/install`, and any others) now render with the new tavern background
- On a mobile device or DevTools mobile emulator, the browser chrome / OS status bar takes on the new `#12291d` colour rather than purple
- The install prompt (on desktop Chrome or Android) shows the new background and theme colour rather than the old white/purple

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Landing page rewrite

### Overview

Rewrite `Welcome.astro` with the correct product name, PRD-grounded tagline, three product-accurate feature cards, and orb/starfield accents tuned to the new palette. CTAs (Sign in / Sign up) preserved unchanged.

### Changes Required

#### 1. Landing component — hero, copy, cards, backdrop

**File**: `src/components/Welcome.astro`

**Intent**: Replace all Astro-starter copy with product-accurate content grounded in `context/foundation/prd.md`, unify the name spelling, retune the atmospheric background (orbs + starfield) to warm-forest hues so it harmonises with the tavern palette rather than fighting it, and keep the hero/name centered as requested.

**Contract**:
- Hero `<h1>`: text content `GameSlot` (one word, replaces "Game Slot"). Gradient recoloured to the new palette — `bg-gradient-to-r from-amber-200 via-amber-300 to-orange-200` (concrete Tailwind literals harmonising with the primary accent).
- Hero description `<p>`: replaces the current "production-ready starter…" copy with two sentences derived from the PRD Vision, roughly:
  > *Coordinate board-game nights without the group-chat back-and-forth. Everyone marks when they're free, the host picks a slot the group can actually make, and everyone gets a push when the session is confirmed.*
  Copy sits within ~40 words; do not make it a paragraph.
- Two CTAs (`/auth/signin`, `/auth/signup`) stay in place; recoloured — primary uses the amber accent (`bg-amber-500 hover:bg-amber-400 text-emerald-950`), outlined uses cream text on subtle cream-tinted border (`border-amber-100/25 text-amber-50 hover:bg-amber-100/10`).
- Feature-card grid: still three cards, still `grid-cols-1 sm:grid-cols-3`, still `rounded-xl border … bg-white/5 backdrop-blur-xl` shape but with cream-tinted border (`border-amber-100/10 bg-amber-50/5`). Card contents replaced with:
  1. **Shared availability** — icon: calendar; body: `Every member marks the day+hour slots they can play, on one shared calendar for the group.` (grounds in FR-005/FR-006)
  2. **Overlap at a glance** — icon: users / overlap; body: `The calendar highlights the slots the most members can make, so the host doesn't have to triangulate manually.` (grounds in FR-008)
  3. **Push on confirm** — icon: bell; body: `The host confirms a slot with a location, and everyone in the group gets a push notification — no chat thread required.` (grounds in FR-009/FR-011/FR-012)
- Orb backgrounds (`Welcome.astro:7-18`): recolour the three blurred orb divs from `bg-purple-500/20` / `bg-blue-500/15` / `bg-indigo-400/10` to warm-forest equivalents — `bg-amber-500/15`, `bg-orange-500/10`, `bg-emerald-400/10`. Positions and blur values unchanged.
- Star-field background pattern (`Welcome.astro:20-25`): keep the radial-gradient pattern but reduce dot opacity (`rgba(245, 230, 200, 0.10)` / `0.06` / `0.04`) so it reads as warm dust rather than cosmic stars.
- Root container class changes `bg-cosmic` → `bg-tavern`.

### Success Criteria

#### Automated Verification

- Type-checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- No `bg-cosmic`, `from-blue-200`, `via-purple-200`, `to-pink-200`, `bg-purple-600`, `bg-purple-500`, `bg-blue-500`, `bg-indigo-400`, `text-purple-300`, or `text-blue-100` utilities remain in `src/components/Welcome.astro`: `grep -En "bg-cosmic|from-blue-200|via-purple-200|to-pink-200|bg-purple-|bg-blue-|bg-indigo-|text-purple-|text-blue-100" src/components/Welcome.astro` returns zero hits
- Hero renders the string "GameSlot" (one word): `grep -n "GameSlot" src/components/Welcome.astro` returns at least one hit; `grep -n "Game Slot" src/components/Welcome.astro` returns zero hits
- No stock Astro-starter phrases remain: `grep -En "production-ready starter|Astro 5|Authentication Ready|Developer Experience|ESLint, Prettier" src/components/Welcome.astro` returns zero hits

#### Manual Verification

- `/` renders "GameSlot" centered as the hero; description reads as the two-sentence product tagline; CTAs still route to `/auth/signin` and `/auth/signup`
- Three feature cards read as the shared-availability / overlap / push-on-confirm strip; all icons render; no Astro-starter references remain
- Landing looks visually cohesive with the tavern palette from Phase 1 — no orphan purple/blue elements
- Mobile viewport (~375px): hero + CTAs + cards all readable; cards stack, no horizontal scroll

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: App-wide utility sweep

### Overview

Replace direct cosmic-palette utility classes across the fourteen non-landing files with tavern-palette equivalents so the visual identity is consistent across every page.

### Changes Required

#### 1. Header / Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Recolour the topbar surface and link colours from cosmic (`border-white/10 bg-white/5 text-white/80`, `text-blue-100/70`, `text-purple-300 hover:text-purple-100`) to tavern equivalents.

**Contract**: Container → `border-amber-100/10 bg-amber-100/5 text-amber-50/85`. User-email span → `text-amber-100/70`. Menu links + form button → `text-amber-300 hover:text-amber-100`. Underline behaviour on hover unchanged. Structural markup unchanged.

#### 2. Notification / install pages and components

**File**: `src/pages/install.astro`

**Intent**: Same recolour treatment (`bg-cosmic` → `bg-tavern` for root; cream borders and text where the file uses white/blue tokens).

**Contract**: Root wrapper `bg-tavern`. Card containers `border-amber-100/10 bg-amber-100/10`. Hero gradient text `from-amber-200 to-amber-300`. Body text uses `text-amber-100/80` (ordered lists) and `text-amber-100/70` (subheads). Semantic content unchanged.

**File**: `src/components/InstallPushBanner.tsx`

**Intent**: Recolour the banner surface + button.

**Contract**: Same mapping — replace purple/blue Tailwind literals with amber/emerald equivalents. Structure and props unchanged.

**File**: `src/components/NotificationControls.tsx` — **no changes needed**

**Intent**: This file consumes only shadcn tokens (`text-muted-foreground`, `text-destructive`) and the `<Button>` component. It has zero direct colour utilities to swap. Phase 1's token flip already changes what this file renders. The invisible-unsubscribe-button issue is scope for the sibling ticket `fix-notification-controls`, not this one.

#### 3. Group calendar + shared UI

**File**: `src/components/GroupCalendar.tsx`

**Intent**: Recolour the calendar-cell state map + surrounding surfaces so cells render in the tavern palette. Preserve the TWO orthogonal semantic axes documented in `GroupCalendar.tsx:245-249` (blue=YOU, purple=GROUP overlap) by mapping YOU → amber and GROUP overlap → emerald in the new palette.

**Contract**: Apply the exact mapping in the "Two-axis colour semantics for GroupCalendar" table under Critical Implementation Details. Every substitution is documented there — cell backgrounds, rings, hover state, confirmed-star colour, cell base border+text, and the ✓ confirm button base/hover/focus. Priority logic (`isMyStart > isHot > iAmAvailable > count > 0 > empty`) unchanged. Non-cell surfaces on this component (outer container `border-white/10 bg-white/5 backdrop-blur-xl`, muted labels `text-blue-100/60`, `text-blue-100/70`) follow the general utility swap — cream borders (`border-amber-100/10 bg-amber-100/5`), muted amber text (`text-amber-100/60`, `text-amber-100/70`).

**File**: `src/components/ui/LibBadge.astro`

**Intent**: Recolour badge chrome.

**Contract**: Direct utility swap; text/border tokens updated to amber/emerald palette.

#### 4. Auth forms + pages

**File**: `src/components/auth/SubmitButton.tsx`

**Contract**: Primary variant `bg-amber-500 hover:bg-amber-400 text-emerald-950`. Loading spinner colour adjusted for readability on amber.

**File**: `src/components/auth/FormField.tsx`

**Contract**: Input surface `bg-amber-100/5 border-amber-100/20 text-amber-50 placeholder:text-amber-100/40 focus:border-amber-300`. Error text uses existing destructive token or a red-400 literal.

**File**: `src/components/auth/SignUpForm.tsx`

**Contract**: Layout and copy unchanged; wrapper / accent utilities replaced with tavern equivalents.

**File**: `src/pages/auth/signin.astro`

**Contract**: Root `bg-tavern`. Card surface `border-amber-100/10 bg-amber-100/10 text-amber-50`. Section-heading gradient uses the **canonical section-heading gradient** from Critical Implementation Details. Subtitle / helper text `text-amber-100/60`. "Sign up" link `text-amber-300 hover:underline`. Outlined SSO button `border-amber-100/20 bg-amber-100/10 hover:bg-amber-100/20 text-amber-50`.

**File**: `src/pages/auth/signup.astro`

**Contract**: Same treatment as `signin.astro` — same canonical gradient, same button/link tokens.

#### 5. Group + invite pages

**File**: `src/pages/groups/index.astro`

**Contract**: Root `bg-tavern`. Page-title heading uses the **canonical section-heading gradient**. Primary CTA `bg-amber-500 hover:bg-amber-400 text-emerald-950`. Group cards `border-amber-100/10 bg-amber-100/5 hover:bg-amber-100/10`. Empty-state text `text-amber-100/80` / `text-amber-100/50`. Group-member-count muted text `text-amber-100/60`.

**File**: `src/pages/groups/new.astro`

**Contract**: Root `bg-tavern`. Card surface `border-amber-100/10 bg-amber-100/10`. Heading uses the **canonical section-heading gradient**. Form label `text-amber-100/80`. Input surface `border-amber-100/20 bg-amber-100/5 text-amber-50 placeholder:text-amber-100/30 focus:border-amber-300 focus:outline-none`. Submit CTA `bg-amber-500 hover:bg-amber-400 text-emerald-950`. "Back to your groups" link `text-amber-300 hover:underline`.

**File**: `src/pages/groups/[id].astro`

**Contract**: Root `bg-tavern`. The two group-header cards + members-list card + slot-marking card use `border-amber-100/10 bg-amber-100/5..10`. Both section headings (`[id].astro:121` "not-found" fallback and `[id].astro:147` group name) use the **canonical section-heading gradient**. Muted subtitle / member text `text-amber-100/60..80`. The nextSession banner block at line 211 uses the **canonical emphasis-banner gradient** for its heading + emerald surround (`border-emerald-400/30 bg-emerald-500/15`) — see Critical Implementation Details. Copy-invite input + button track auth form styling. "(you)" and "creator" tags: `text-amber-100/50` for `(you)`, `text-amber-300` for `creator` — keeps role distinction without clashing with GroupCalendar's amber/emerald cell axes.

**File**: `src/pages/invite/[token].astro`

**Contract**: Root `bg-tavern`. Card surface follows auth card treatment. Both headings (invalid state at `:51`, sign-in-required state at `:75`) use the **canonical section-heading gradient**. Body copy `text-amber-100/70`. Invite-accept primary CTA `bg-amber-500 hover:bg-amber-400 text-emerald-950`; alternate outlined action `border-amber-100/20 bg-amber-100/10 hover:bg-amber-100/20`. "Back to home" link `text-amber-300 hover:underline`.

### Success Criteria

#### Automated Verification

- Type-checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Zero old palette references remain under `src/`: `grep -rEn "bg-cosmic|from-blue-|via-purple-|to-pink-|from-purple-|to-purple-|bg-purple-[0-9]|bg-blue-[0-9]|bg-indigo-[0-9]|text-purple-[0-9]|text-blue-|ring-purple-|border-purple-|border-white/[0-9]|bg-white/[0-9]" src/` returns zero hits, OR each remaining hit is explicitly whitelisted in a comment as intentional. The pattern catches gradient halves (`from-`/`to-`/`via-`), state prefixes (`hover:`/`focus:` fall out naturally since grep matches the utility substring), and both purple and blue variants at any weight.
- `npm run build` succeeds and emits a `dist/` bundle without warnings related to unknown Tailwind classes

#### Manual Verification

- Every route renders in the tavern palette on both desktop and mobile widths: `/`, `/auth/signin`, `/auth/signup`, `/groups`, `/groups/new`, `/groups/[id]` (pick a real id), `/install`, `/invite/[token]` (pick a valid token)
- No page is visibly stuck in the old cosmic palette
- Group calendar's overlap heat map reads correctly — higher-overlap slots are more saturated than lower ones
- Auth forms remain usable — inputs have adequate contrast, focus states visible, error text legible
- PWA install screen (Android Chrome or desktop Chrome) shows the tavern background/theme colour end-to-end

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before archiving the change.

---

## Testing Strategy

### Unit Tests

- No new unit tests. This change is styling / copy only — no logic branches, no state, no data flow changes to cover.

### Integration Tests

- No new integration tests. Existing auth / group / invite integration coverage (if any) should continue to pass; the changes here don't alter any API contract.

### Manual Testing Steps

1. `npm run dev`; open `/` in desktop Chrome — confirm hero says "GameSlot", tagline and cards match the new copy, palette is tavern (no purple/blue).
2. Toggle DevTools mobile emulator (iPhone 12 or similar) — confirm layout stacks correctly, no horizontal overflow, CTAs reachable, cards readable.
3. Navigate `/` → `/auth/signin` → `/auth/signup` → back to `/` — confirm palette continuity across pages.
4. Log in (Google SSO), visit `/groups`, `/groups/new`, an existing `/groups/[id]` — confirm every page renders in the tavern palette.
5. Visit `/install` and `/invite/[token]` — same check.
6. On a mobile device (real, if possible): install as PWA, confirm the OS status bar takes the new theme colour, confirm the splash / install prompt shows the new background.
7. `grep -rEn "bg-cosmic|from-blue-|via-purple-|to-pink-|from-purple-|to-purple-|bg-purple-[0-9]|bg-blue-[0-9]|bg-indigo-[0-9]|text-purple-[0-9]|text-blue-|ring-purple-|border-purple-|border-white/[0-9]|bg-white/[0-9]" src/` — zero hits (or documented exceptions only).

## Performance Considerations

- No runtime performance implications. CSS variable count and Tailwind literal count are unchanged; the class strings on each element are the same length within a token.
- One theoretical concern: the recoloured orb/starfield still runs a full-viewport blur composite. It was there before, so no regression — but if a future ticket wants to lift Lighthouse scores on `/`, dropping the orbs is a natural next step.

## Migration Notes

Nothing to migrate — no data model, no persistence, no environment change. `git pull` + `npm install` (unchanged) + `npm run dev` picks the new palette up on the first render. If a user has the PWA installed on their phone, the new `theme_color` takes effect the next time the service worker fetches an updated manifest; a manual reinstall is only needed if the OS is caching aggressively.

## References

- Product framing / Vision: `context/foundation/prd.md:22`
- Current landing implementation: `src/components/Welcome.astro`
- Current palette source: `src/styles/global.css:113` (`bg-cosmic` utility)
- Palette reach (files with direct utilities): grep against `bg-cosmic|from-blue-200|via-purple-200|bg-purple-6|text-blue-100|text-purple-3|border-white/10|bg-white/5` in `src/`
- Sibling ticket that will consume this palette: `context/changes/logo-links-to-landing/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Palette + PWA metadata

#### Automated

- [x] 1.1 Type-checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 No `bg-cosmic` references remain in `src/`: `grep -rn "bg-cosmic" src/` returns zero hits
- [x] 1.4 New utility is defined: `grep -n "bg-tavern" src/styles/global.css` returns exactly one hit at the utility declaration

#### Manual

- [ ] 1.5 `npm run dev` starts cleanly; `/` renders with a deep-forest gradient background (no purple)
- [ ] 1.6 All four pages using the old `bg-cosmic` (`/`, `/install`, and any others) now render with the new tavern background
- [ ] 1.7 On a mobile device or DevTools mobile emulator, the browser chrome / OS status bar takes on the new `#12291d` colour rather than purple
- [ ] 1.8 The install prompt (on desktop Chrome or Android) shows the new background and theme colour rather than the old white/purple

### Phase 2: Landing page rewrite

#### Automated

- [ ] 2.1 Type-checking passes: `npm run typecheck`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 No `bg-cosmic`, `from-blue-200`, `via-purple-200`, `to-pink-200`, `bg-purple-600`, `bg-purple-500`, `bg-blue-500`, `bg-indigo-400`, `text-purple-300`, or `text-blue-100` utilities remain in `src/components/Welcome.astro`
- [ ] 2.4 Hero renders the string "GameSlot" (one word); "Game Slot" returns zero hits
- [ ] 2.5 No stock Astro-starter phrases remain in `src/components/Welcome.astro`

#### Manual

- [ ] 2.6 `/` renders "GameSlot" centered as the hero; description reads as the two-sentence product tagline; CTAs still route to `/auth/signin` and `/auth/signup`
- [ ] 2.7 Three feature cards read as the shared-availability / overlap / push-on-confirm strip; all icons render; no Astro-starter references remain
- [ ] 2.8 Landing looks visually cohesive with the tavern palette from Phase 1 — no orphan purple/blue elements
- [ ] 2.9 Mobile viewport (~375px): hero + CTAs + cards all readable; cards stack, no horizontal scroll

### Phase 3: App-wide utility sweep

#### Automated

- [ ] 3.1 Type-checking passes: `npm run typecheck`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Zero old-palette references remain under `src/` (or every remaining hit is a documented exception): `grep -rEn "bg-cosmic|from-blue-|via-purple-|to-pink-|from-purple-|to-purple-|bg-purple-[0-9]|bg-blue-[0-9]|bg-indigo-[0-9]|text-purple-[0-9]|text-blue-|ring-purple-|border-purple-|border-white/[0-9]|bg-white/[0-9]" src/`
- [ ] 3.4 `npm run build` succeeds and emits a `dist/` bundle without warnings related to unknown Tailwind classes

#### Manual

- [ ] 3.5 Every route renders in the tavern palette on both desktop and mobile widths (`/`, `/auth/signin`, `/auth/signup`, `/groups`, `/groups/new`, `/groups/[id]`, `/install`, `/invite/[token]`)
- [ ] 3.6 No page is visibly stuck in the old cosmic palette
- [ ] 3.7 Group calendar's overlap heat map reads correctly — higher-overlap slots are more saturated than lower ones
- [ ] 3.8 Auth forms remain usable — inputs have adequate contrast, focus states visible, error text legible
- [ ] 3.9 PWA install screen (Android Chrome or desktop Chrome) shows the tavern background/theme colour end-to-end
