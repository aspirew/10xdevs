# Rename Notifications to Settings + Drop Signed-Out Install Implementation Plan

## Overview

Two coupled menu changes on `Topbar.astro`: (1) the signed-in "Notifications" link is renamed to "Settings" since the destination page covers both install steps and notification prefs, and (2) the signed-out "Install" link is dropped entirely — signed-out visitors don't need a shortcut to the install/notification surface yet. For internal consistency, the destination page (`/install`) is also relabelled to "Settings" in its hero + browser tab title (the route stays at `/install` — no redirect churn).

## Current State Analysis

- `src/components/Topbar.astro` — the shared nav. Signed-in branch shows `[logo] | Groups | Notifications | Sign out`. Signed-out branch shows `[logo] | Install | Sign in | Sign up`. Each link is a `<a href="…" class="text-amber-300 transition-colors hover:text-amber-100 hover:underline">…</a>`.
- `src/pages/install.astro:18` — Layout title `"Install GameSlot"`; hero card h1 `"Install GameSlot"` at `:24-29`. Below the hero: three cards — install instructions (platform-conditional), notifications settings, and inside the notifications card a `<NotificationControls client:load>` island. So the page really does cover install AND notification prefs.
- `/install` route path stays the same; nothing else in the codebase currently references the `/install` URL except: the Topbar links (both branches), the NotificationControls component's redirect link (`/auth/signin?next=/install` at `NotificationControls.tsx:87`), the meta description in this plan is nothing, and no docs. No breakage from keeping the path.
- No i18n layer; strings are inlined. Simple text edits.

### Key Discoveries

- The Topbar's `<a>` element for the signed-in "Notifications" link has `href="/install"` — the URL will become misleading if we don't also relabel the destination page. Renaming just the menu without the page would create a "click Settings → arrive at Install GameSlot" jump that reads as inconsistency.
- Removing the signed-out "Install" link means signed-out visitors can no longer discover the install/notification surface directly from the nav. That's fine per the ticket ("The install affordance can live elsewhere later"); the landing page's future PWA prompt is out of scope for this ticket.
- `NotificationControls.tsx:87` uses `href="/auth/signin?next=/install"` to send unauthenticated visitors to sign-in and back. That's a code-level reference to the `/install` URL — safe as-is since we're keeping the route.

## Desired End State

- Signed-in Topbar reads: `[logo] | Groups | Settings | Sign out`. The "Settings" link routes to `/install`.
- Signed-out Topbar reads: `[logo] | Sign in | Sign up`. No Install link anywhere in the nav.
- The `/install` page's browser tab title reads "GameSlot Settings"; the hero card h1 reads "Settings".
- Everything else on `/install` stays exactly as-is (install instructions cards, NotificationControls island, styling).
- The `/install` route continues to resolve — no redirect, no route rename. Existing bookmarks + the `next=/install` sign-in redirect keep working.
- Screen readers still announce the nav links correctly.

Verification: on prod, `curl -s /install | grep -c "Settings"` returns ≥ 2 (browser title + hero h1); `curl -s /groups | grep -c "Notifications"` returns 0 for signed-in Topbar rendering; `curl -s /groups | grep -c "Install"` returns 0 for signed-out Topbar rendering.

## What We're NOT Doing

- No route change. `/install` remains `/install`. A rename to `/settings` would require middleware redirects, updating `NotificationControls.tsx:87`'s `next=` param, and a Vercel deploy-time redirect rule for old bookmarks. Not worth it at friend-group scale.
- No page structure change. Install instructions and notification prefs both stay on the same page. If we ever want a settings hub with tabs, that's a v2 concern.
- No new PWA install prompt on the landing page or elsewhere. The ticket explicitly parks that.
- No i18n. Strings stay inline.
- No new tests. Consistent with prior slices — manual smoke on prod.
- No changes to the NotificationControls island's behavior. Only the surrounding page shell copy changes.
- No changes to any other nav item (Groups / Sign in / Sign up / Sign out) or the logo link.

## Implementation Approach

Single phase, two files touched. All edits are pure string swaps. Verify via typecheck + lint + build + `grep` sanity checks + manual smoke on `/groups` (Topbar rendered) + `/install` (page + Topbar).

## Phase 1: Rename Notifications → Settings; drop signed-out Install

### Overview

Update `Topbar.astro` to swap the "Notifications" label → "Settings" in the signed-in branch and delete the "Install" link in the signed-out branch. Update `install.astro` to change its Layout title from "Install GameSlot" → "GameSlot Settings" and its hero h1 from "Install GameSlot" → "Settings". All other markup on both files stays put.

### Changes Required

#### 1. Topbar — rename Notifications → Settings; drop Install

**File**: `src/components/Topbar.astro`

**Intent**: In the signed-in branch, change the visible label of the `href="/install"` link from "Notifications" to "Settings". In the signed-out branch, remove the entire `<a href="/install">Install</a>` element so the signed-out visitor no longer has that shortcut.

**Contract**:
- Signed-in branch: locate the `<a href="/install" class="text-amber-300 …">Notifications</a>` element (currently around lines 16–18) and change its text content from `Notifications` to `Settings`. Do not change the `href`, classes, or surrounding structure.
- Signed-out branch: locate and delete the entire `<a href="/install" class="text-amber-300 …">Install</a>` element (currently around lines 30–32). Sign in and Sign up links stay, still wrapped in the surrounding `<div class="flex gap-3">`.

#### 2. Install page — retitle hero + Layout

**File**: `src/pages/install.astro`

**Intent**: Rename the page hero + browser tab title from "Install GameSlot" to "Settings" / "GameSlot Settings" so it matches the nav label. The rest of the page (per-platform install instructions, notification card + NotificationControls island) is unchanged — the page still covers both install and notification setup.

**Contract**:
- Change the Layout `title` prop from `"Install GameSlot"` to `"GameSlot Settings"` (around line 18).
- Change the hero card's `<h1>...</h1>` from `Install GameSlot` to `Settings` (around lines 24–29). Keep all classes, keep the surrounding card wrapper and the subtitle paragraph.
- Everything else on the page stays: platform-conditional install instructions cards, the "Notifications" card header + NotificationControls island.

### Success Criteria

#### Automated Verification

- `npm run typecheck` passes
- `npm run lint` passes
- `npm run build` succeeds
- `grep -c "Notifications" src/components/Topbar.astro` returns 0 (label swapped)
- `grep -c "Settings" src/components/Topbar.astro` returns 1 (new label)
- `grep -c 'href="/install"' src/components/Topbar.astro` returns 1 (was 2; signed-out Install link removed, signed-in Settings link stays)
- `grep -c "Install GameSlot" src/pages/install.astro` returns 1 (only the subtitle remains after title + h1 rename)
- `grep -c 'title="GameSlot Settings"' src/pages/install.astro` returns 1 (Layout title is renamed)

#### Manual Verification

- On prod, signed-in on `/groups`: Topbar reads `[logo] | Groups | Settings | Sign out`
- Clicking "Settings" routes to `/install`, which now displays hero "Settings" and browser tab shows "GameSlot Settings"
- The Settings page still shows platform-conditional install instructions (iOS/Android/desktop) and the notifications card + NotificationControls
- Signed-out on any Topbar-having page (landing, `/install`): Topbar reads `[logo] | Sign in | Sign up` (no Install link)
- Directly visiting `/install` while signed-out still works (page renders; NotificationControls prompts "Sign in to enable notifications")
- Sign-in `next=/install` redirect still works: click Sign in from NotificationControls' prompt, sign in, land back on `/install` (now titled "Settings")
- No console errors on any of the above
- Tag production deploy as `prod-<date>-settings-rename` after production smoke passes

**Implementation Note**: After Phase 1 lands and all manual verification passes, this slice is complete.

## Testing Strategy

### Manual Testing Steps

1. Sign in → land on `/groups` → verify Topbar reads `... | Settings | Sign out`.
2. Click "Settings" → verify browser tab title is "GameSlot Settings" and hero h1 is "Settings".
3. On the same page, verify install instructions + notifications card still render.
4. Sign out → verify Topbar has no Install link (only Sign in / Sign up on the right).
5. Directly visit `/install` while signed-out → page still renders; NotificationControls asks to sign in.

## References

- Ticket source: `context/changes/rename-notifications-and-drop-install/change.md`
- Component under edit: `src/components/Topbar.astro`
- Page under edit: `src/pages/install.astro`
- `/install` URL callers (unchanged): `src/components/NotificationControls.tsx:87` (sign-in redirect `next=/install`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rename Notifications → Settings; drop signed-out Install

#### Automated

- [x] 1.1 `npm run typecheck` passes — 1fe5f1b
- [x] 1.2 `npm run lint` passes — 1fe5f1b
- [x] 1.3 `npm run build` succeeds — 1fe5f1b
- [x] 1.4 `grep -c "Notifications" src/components/Topbar.astro` returns 0 — 1fe5f1b
- [x] 1.5 `grep -c "Settings" src/components/Topbar.astro` returns 1 — 1fe5f1b
- [x] 1.6 `grep -c 'href="/install"' src/components/Topbar.astro` returns 1 (was 2) — 1fe5f1b
- [x] 1.7 `grep -c "Install GameSlot" src/pages/install.astro` returns 1 (subtitle preserved) — 1fe5f1b
- [x] 1.8 `grep -c 'title="GameSlot Settings"' src/pages/install.astro` returns 1 — 1fe5f1b

#### Manual

- [x] 1.9 Signed-in on `/groups`: Topbar reads `[logo] | Groups | Settings | Sign out` — 1fe5f1b
- [x] 1.10 Clicking "Settings" routes to `/install`; hero reads "Settings"; browser tab title reads "GameSlot Settings" — 1fe5f1b
- [x] 1.11 Settings page still shows install-instruction cards + notifications card + NotificationControls — 1fe5f1b
- [x] 1.12 Signed-out Topbar has no Install link; only Sign in and Sign up on the right — 1fe5f1b
- [x] 1.13 Direct visit to `/install` while signed-out: page renders; NotificationControls prompts to sign in — 1fe5f1b
- [x] 1.14 Sign-in `next=/install` round-trip works (sign in → back to `/install` now titled Settings) — 1fe5f1b
- [x] 1.15 No console errors on any of the above — 1fe5f1b
- [x] 1.16 Tag production deploy as `prod-<date>-settings-rename` — 1fe5f1b
