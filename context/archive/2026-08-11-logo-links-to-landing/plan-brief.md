# Logo Links to Landing — Plan Brief

> Full plan: `context/changes/logo-links-to-landing/plan.md`

## What & Why

Once you're inside the app, there's no way to navigate back to the landing page. Add a clickable GameSlot logo on the left side of the shared `Topbar` that routes to `/`. Since `Topbar` is mounted on every navigable page (landing + groups + install), every user always has home one click away.

## Starting Point

`src/components/Topbar.astro` renders `flex justify-between` with `{user.email}` (or "Not signed in") on the left and nav actions on the right. No logo anywhere; no home affordance from the header. `public/logo.png` is a fresh 1254×1254 PNG with the GameSlot brand mark and "GAME SLOT" wordmark baked in — dark green background matches the tavern gradient.

## Desired End State

Every page with a Topbar (landing, groups list, group detail, new group, install) shows the GameSlot logo on the left, rendered at ~32px tall inside an `<a href="/">`. Clicking navigates to `/`; hovering dims to 90% opacity. The email / "Not signed in" text disappears; right-side nav actions stay unchanged. Screen readers announce "GameSlot" via the img's alt.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Placement | Left side, replacing the email/status span | Standard web convention: brand mark on the left, actions on the right. |
| Fate of email/status text | Drop entirely | Users know their own email; keeping it clutters the header. |
| Sizing | `h-8 w-auto` (~32px tall) | Fits Topbar's `py-2` padding without vertical growth. |
| Hover state | `hover:opacity-90` | Signals clickability without over-styling. |
| Accessibility | `alt="GameSlot"` on img; no aria-label on link | The img's alt provides the accessible name for screen readers. |
| Landing behavior | Logo links to `/` on every page including `/` itself | Standard: click on landing's own logo = same-page refresh. |
| Auth pages | No change | `/auth/signin` and `/auth/signup` don't have Topbar; deliberate — one-off unauth flows. |
| Favicon / PWA icons | Unchanged | `logo.png` is the header wordmark; `favicon.png` and `icons/icon-192.png` are separate F-02 PWA assets. |

## Scope

**In scope:**
- `src/components/Topbar.astro` — replace both branches' left-side text with an `<a href="/"><img /></a>` block

**Out of scope:**
- No Topbar addition on auth pages
- No logo resize / crop / recolor
- No separate wordmark next to img (baked in)
- No favicon change
- No breadcrumbs, page titles in Topbar, or user avatar
- No responsive variants
- No animated hover
- No automated tests

## Architecture / Approach

Single-file surgical edit. Both auth-state branches of `Topbar.astro` swap their left-side `<span>` for the same anchor+img markup. Nav actions on the right and the flex layout are untouched. Verify via typecheck + lint + build + `grep` sanity checks + manual smoke.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Add logo link to Topbar | Logo present on left, links to `/`, visible on every Topbar-having page | Very low — single-file surgical edit; layout unchanged. |

**Prerequisites:**
- `public/logo.png` in place (✓ done)
- Dev environment builds/lints/typechecks cleanly

**Estimated effort:** ~15 min (single file, single logical change).

## Open Risks & Assumptions

- **Assumption: the logo's baked-in wordmark reads legibly at 32px height on mobile.** The 1254×1254 source scales down cleanly; verified during manual smoke on a 375px viewport.
- **Assumption: users won't miss the email/status text.** Any confusion is trivially resolved — email is available on other surfaces (e.g., install page) and status is implicit from the nav actions.

## Success Criteria (Summary)

- On prod, every Topbar-having page shows the GameSlot logo on the left.
- Clicking the logo routes to `/`.
- Hover reduces opacity to 90%.
- Signed-in and signed-out states both render the logo identically.
- Screen readers announce "GameSlot" when the link is focused.
