# Logo Links to Landing Implementation Plan

## Overview

Once you're inside the app, there's no way to navigate back to the landing page. Add a clickable GameSlot logo on the left side of the shared `Topbar` that routes to `/`. The logo replaces the current `{email}` / `Not signed in` label on the left. Since `Topbar` is mounted on every navigable page (landing, groups list, group detail, new group, install), this covers every place a user might be.

## Current State Analysis

- `src/components/Topbar.astro` — single shared component. Current layout is `flex justify-between rounded-xl border ... py-2 px-4`. Left slot: `<span>{user.email}</span>` or `<span>Not signed in</span>`. Right slot: nav actions (`Groups`, `Notifications`, `Sign out` when signed in; `Install`, `Sign in`, `Sign up` when signed out).
- `Topbar` is mounted at the top of the following pages: `src/components/Welcome.astro` (the landing), `src/pages/groups/index.astro`, `src/pages/groups/[id].astro`, `src/pages/groups/new.astro`, `src/pages/install.astro`. Not on `/auth/signin` or `/auth/signup` — deliberate; those are one-off unauth flows.
- `public/logo.png` — new asset, 1254×1254 PNG. GameSlot brand mark (calendar + die) with the "GAME SLOT" wordmark baked into the image. Dark-green background (`#12291d`-ish) matches the app's tavern gradient — no chroma-key or separate wordmark needed.
- No existing logo asset in the header; the app has never had a home-link affordance from the nav.
- `Layout.astro` already sets `<link rel="apple-touch-icon" href="/icons/icon-192.png">` — the 192px favicon is F-02's PWA icon, separate from the wordmark logo. Not touched by this plan.

### Key Discoveries

- The logo asset already contains the "GAME SLOT" wordmark — no adjacent text needed next to the img. Keeps the header tight.
- Since the img has the wordmark, `alt="GameSlot"` is the correct accessible label; the wrapping `<a href="/">` doesn't need an extra `aria-label` (the img's alt propagates).
- `Topbar` already sits on `/` (via `Welcome.astro`) — the logo on the landing page just links to itself, which is standard web behavior (click on any nav bar's logo → home; on home → refresh). No conditional-render special case needed.
- The `flex justify-between` layout means the logo (left) and the nav actions (right) will auto-balance. No layout refactor.

## Desired End State

- On every page with a `Topbar` (landing + groups list + group detail + new group + install), the left side of the header shows the GameSlot logo as an `<img>` inside an `<a href="/">`. The logo renders at ~32px tall (`h-8 w-auto`).
- Hovering the logo dims it slightly (`hover:opacity-90`), signalling clickability without over-styling.
- Clicking the logo navigates to `/`. On any non-landing page, the user reaches the landing. On the landing itself, it's a no-op refresh — same as any web brand mark.
- The current `{email}` / `Not signed in` text is gone from the left side. Nav actions on the right stay unchanged (Groups / Notifications / Sign out for signed-in; Install / Sign in / Sign up for signed-out).
- Screen readers announce "GameSlot" when focusing the link (via the img's alt text).
- No visual regression: the header maintains the same height, the same rounded amber-tinted background, the same spacing to the content below it.

Verification: `curl -s https://10xdevs-lilac.vercel.app/groups | grep -c 'href="/"'` shows the new home link is present; DOM inspection of the deployed page's Topbar shows the img is rendered at the intended size and hits the expected asset URL (`/logo.png`).

## What We're NOT Doing

- No auth-page logo. `/auth/signin` and `/auth/signup` don't have `Topbar`; they're one-off unauthenticated flows and don't need home navigation. Adding Topbar there would be out of scope.
- No logo resize / crop / recolor. `public/logo.png` is used as-is; the wordmark inside the image is part of the brand.
- No separate wordmark next to the img. The wordmark is baked in.
- No favicon change. F-02's `/favicon.png` and `/icons/icon-192.png` are unrelated PWA assets.
- No breadcrumbs, no page titles in Topbar, no username avatar. Scope is strictly "logo → home".
- No mobile / desktop responsive variants. The single `h-8 w-auto` works on both — 32px is small enough for phones and appropriate on desktop.
- No animated hover (spin, scale, glow). `hover:opacity-90` is enough affordance.
- No new tests (consistent with project convention — manual smoke on prod).

## Implementation Approach

Single phase, single file. `Topbar.astro` gets a new element in each branch (signed-in and signed-out) that replaces the current left-side text span. Verify via typecheck + lint + build + manual smoke.

## Phase 1: Add logo link to Topbar

### Overview

Replace the left-side text in `Topbar.astro` with an `<a href="/"><img src="/logo.png" alt="GameSlot" class="h-8 w-auto ..." /></a>`. Both branches (signed-in and signed-out) get the same replacement so the visual is consistent regardless of auth state. Nav actions on the right are untouched.

### Changes Required

#### 1. Topbar — replace left-side text with logo link

**File**: `src/components/Topbar.astro`

**Intent**: On both auth-state branches, swap the current `{user.email}` / `Not signed in` span for an `<a href="/">` wrapping an `<img>` of the logo. The img is sized `h-8 w-auto` for a compact ~32px height that fits the Topbar's `py-2` padding without vertical growth.

**Contract**:
- Signed-in branch: replace `<span class="text-amber-100/70">{user.email}</span>` with `<a href="/" class="inline-flex items-center transition-opacity hover:opacity-90"><img src="/logo.png" alt="GameSlot" class="h-8 w-auto" /></a>`.
- Signed-out branch: replace `<span class="text-amber-100/70">Not signed in</span>` with the same anchor + img markup as above.
- The parent flex container's `justify-between` stays untouched — right-side action buttons auto-balance against the new left-side anchor.
- Do NOT add `aria-label` on the anchor; the img's `alt="GameSlot"` provides the accessible name.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- `grep -c "src=\"/logo.png\"" src/components/Topbar.astro` returns 2 (one for each auth-state branch)
- `grep -c "{user.email}" src/components/Topbar.astro` returns 0 (email span was removed)
- `grep -c "Not signed in" src/components/Topbar.astro` returns 0 (status span was removed)

#### Manual Verification

- Vercel deploy: visit `/groups` while signed in → logo appears on left of the Topbar with visible amber-on-green branding, ~32px tall; nav actions unchanged on the right
- Click the logo → routes to `/` (the landing page)
- Hover the logo → subtle opacity change (0.9)
- On `/` (the landing), the logo still renders and clicking it is a same-page refresh (standard behavior)
- Signed-out `/install`: logo appears identically; clicking routes to `/`
- All other pages with Topbar (`/groups`, `/groups/<id>`, `/groups/new`, `/install`) have the logo present
- Focus the logo with Tab: screen reader announces "GameSlot" (from the img's alt); Enter navigates to `/`
- Mobile viewport (375px): logo fits without wrapping or overflowing; Topbar height is unchanged from baseline
- No console errors on any of the above
- Tag production deploy as `prod-<date>-logo` after production smoke passes

**Implementation Note**: After Phase 1 lands and all manual verification passes, this slice is complete.

## Testing Strategy

### Manual Testing Steps

1. Preview or prod deploy → sign in → land on `/groups` → verify logo appears on the left of the Topbar and clicking it goes to `/`.
2. Return to `/groups` → open `/groups/<id>` and `/install` → verify logo persists across every page.
3. Sign out → visit `/install` → verify logo still present in the signed-out Topbar.
4. On the landing page `/` itself, click the logo → same-page reload (no error).
5. Mobile viewport at 375px in DevTools → verify no layout overflow.

## References

- Ticket source: `context/changes/logo-links-to-landing/change.md`
- Component under edit: `src/components/Topbar.astro`
- Logo asset: `public/logo.png` (1254×1254 PNG, GameSlot brand mark with wordmark baked in)
- Topbar mount points: `src/components/Welcome.astro`, `src/pages/groups/index.astro`, `src/pages/groups/[id].astro`, `src/pages/groups/new.astro`, `src/pages/install.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add logo link to Topbar

#### Automated

- [x] 1.1 `npm run typecheck` passes
- [x] 1.2 `npm run lint` passes
- [x] 1.3 `npm run build` succeeds
- [x] 1.4 `grep -c "src=\"/logo.png\"" src/components/Topbar.astro` returns 2 (one per auth-state branch)
- [x] 1.5 `grep -c "{user.email}" src/components/Topbar.astro` returns 0
- [x] 1.6 `grep -c "Not signed in" src/components/Topbar.astro` returns 0

#### Manual

- [x] 1.7 `/groups` while signed in: logo appears on left of Topbar, nav actions unchanged on right
- [x] 1.8 Clicking the logo routes to `/`
- [x] 1.9 Hovering the logo dims it slightly (opacity 0.9)
- [x] 1.10 On `/`, clicking the logo triggers a same-page reload with no error
- [x] 1.11 Signed-out `/install`: logo appears and routes to `/`
- [x] 1.12 All Topbar-having pages (`/groups`, `/groups/<id>`, `/groups/new`, `/install`) render the logo
- [x] 1.13 Keyboard Tab focus reaches the logo; screen reader announces "GameSlot" (from alt text)
- [x] 1.14 Mobile viewport 375px: logo fits without wrapping or overflowing Topbar height
- [x] 1.15 No console errors on any of the above
- [x] 1.16 Tag production deploy as `prod-<date>-logo`
