---
project: GameSlot
updated: 2026-05-20
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-06-10
  after_hours_only: false
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 12
  quality_check_status: accepted
---

# GameSlot — Shape Notes

Seed idea (from idea.md): a coordination app for friends who play board games together — friends mark availability, a host picks a slot and location, and the group gets notifications. The pain is that scattered availability conversations (chat threads, group polls, "let me check my calendar" pings) make it hard to land a common time to actually meet.

## Vision & Problem Statement

GameSlot reduces the coordination overhead of getting a group of friends together for a board-game session. Today, organizing a session means a host running repeated back-and-forth conversations across chat threads, group polls, and DMs to triangulate who is free, when, and where — availability is scattered, changes silently, and the resulting noise causes sessions to be scheduled badly or skipped entirely. GameSlot replaces that loose-thread coordination with a single, shared, lightweight calendar view tailored to a friend group, where availability is visible at a glance, a host can pick a slot and confirm it, and the group is notified — without integrating personal calendars or layering on chat.

The insight: generic scheduling tools (Doodle, When2Meet, calendar polls) are too generic for this loop. They produce a one-shot poll outcome but lack first-class semantics for the recurring "friend group + host + location + notify" pattern, so groups fall back to chat and the friction returns.

**Scope caveat (from Socrates round):** the problem may not exist for very small (4–6 person), tight-knit groups that already meet on a fixed weekly cadence. GameSlot's value assumes a group where availability genuinely varies week to week, or where group size makes ad-hoc coordination expensive. The MVP user is one such group, with the user as host.

## User & Persona

**Primary persona — The Host (you).** A member of a friend group who wants to play board games together more often and who currently shoulders the coordination work. The host knows the group, knows roughly when sessions tend to happen, and is the person who would today open a chat thread to ask "who's free Saturday?". The host's success is "I sent an invite, people responded by marking slots, I picked one, everyone showed up."

**Secondary persona — The Player.** A member of the same friend group. Lightweight involvement: opens the app, marks availability, gets notified when a session is confirmed. The player's success is "I marked when I was free and learned about the next session without having to follow a chat."

## Access Control

**Authentication.** Google OAuth sign-in only. No password storage, no email/magic-link path for v1 (deferred during Socrates round — see FR-001). Google was chosen as the single auth provider for v1 because it covers the relevant friend-group population without doubling the auth surface. This is the smallest model that still lets users sync availability across their devices and receive notifications addressed to a stable identity.

**Group membership.** A group is created by one user; that user generates a shareable invite link to bring others in. Anyone who follows the link and authenticates joins the group.

**Roles.** Membership is flat at the group level — every member can mark availability, propose a slot, and confirm a slot. "Host" is a per-session role: whoever confirms a slot becomes the host of that session and is the one who sets the location.

## Success Criteria

### Primary

The core flow runs end-to-end for one real friend group, in three weeks of after-hours work:

1. Host signs up and creates a group; shares a join link with friends.
2. Friends follow the link, authenticate, and join the group.
3. Each member opens the group's shared calendar and marks day + start-hour slots they are available.
4. The shared calendar surfaces overlapping availability across members.
5. Host picks one overlapping slot, sets a meeting location, and confirms it.
6. Every group member receives a notification that the session is confirmed (with day, time, location).

"Works" = at least one real session is scheduled and attended via this flow.

### Secondary (nice-to-have, not required for v1)

- _Originally: "someone else is free then" notification. Dropped during Socrates round — the debouncing / deduplication mechanics are too risky for v1 and the FR was deferred fully to a v2 candidate._

### Guardrails (must not break in v1)

- **Privacy:** group membership and members' availability are visible only to members of that group. No public profile, no search, no leakage of who is in which group or when they are free.

## Functional Requirements

### Authentication & Identity

- FR-001: A person can sign in using Google OAuth. Priority: must-have
  > Socrates: Counter considered: "supporting both magic link and Google OAuth doubles the auth surface for negligible benefit." Resolution: revised — dropped the magic link; v1 ships Google OAuth only. Email-based passwordless can return in v2 if needed.

### Groups & Membership

- FR-002: A signed-in user can create a friend group. Priority: must-have
  > Socrates (covers FR-002/003/004): Counter considered: "invite-link expiry / rotation isn't covered — stale links live forever." Resolution: kept as written; gap logged in `## Open Questions` (invite-link lifecycle) for downstream resolution.
- FR-003: The creator of a group can generate a shareable invite link for that group. Priority: must-have
- FR-004: A signed-in user who opens a valid invite link joins the corresponding group. Priority: must-have

### Availability

- FR-005: A group member can view the group's shared availability calendar. Priority: must-have
  > Socrates: Counter considered: "a 'calendar view' is heavy UI; a list view ships faster." Resolution: kept — the calendar view IS the product (seeing overlap at a glance).
- FR-006: A group member can mark themselves available for a day + start-hour slot. Priority: must-have
  > Socrates: Counter considered: "hour granularity is too coarse; should be 30-min or 15-min." Resolution: kept — matches how friend groups actually negotiate time ("Saturday around 7pm"). Finer granularity is a v2 candidate.
- FR-007: A group member can unmark a previously marked availability slot. Priority: must-have
  > Socrates: Counter considered: "unmarking AFTER a session is confirmed at that slot creates a weird state." Resolution: kept; behavior at the confirm-time boundary logged in `## Open Questions` (post-confirm unmark semantics).
- FR-008: The calendar surfaces which slots have overlapping availability across members and how many members are available for each slot. Priority: must-have
  > Socrates: Counter considered: "this is the only FR doing real domain work; if it's wrong the rest is dressing." Resolution: kept — accepted as the load-bearing FR; designs in downstream phases should treat it as such.

### Session Confirmation

- FR-009: A group member can pick an availability slot and propose it as the session slot for the group. Priority: must-have
  > Socrates (covers FR-009/010/011): Counter considered: "anyone can confirm any slot — concurrency races, location as free-text is sloppy, 'host' role may be pre-decided in real groups." Resolution: kept as written — per-session host emerges from whoever confirms; free-text location is intentional for v1 (no maps integration); concurrency is acceptable risk at friend-group scale.
- FR-010: When proposing a session slot, the proposer sets a meeting location (free-text). Priority: must-have
- FR-011: The proposer confirms the session, becoming its host. Priority: must-have

### Notifications

- FR-012: When a session is confirmed, every member of the group receives a push notification (mobile/web push) with day, time, and location. Priority: must-have
  > Socrates: Counter considered: "iOS Safari web push is unreliable; permission may be denied; users have no in-app surface to revisit the notification." Resolution: kept — push is the right channel for immediacy; permission denial and in-app inbox logged in `## Open Questions`.

## Open Questions

These gaps surfaced during Socrates challenges and were deliberately not resolved at the shaping phase — they belong to downstream design or implementation. `/10x-prd` should mirror these.

- **Invite-link lifecycle:** how do invite links expire, rotate, or get revoked? (Concern: a leaked link gives strangers access.)
- **Post-confirm unmark semantics:** if a member unmarks an availability slot after a session has been confirmed at that slot, what happens? (Concern: data-model integrity at the confirm-time boundary.)
- **Push delivery fallback:** what happens when a user has denied push permission, or push fails to deliver? Is there a fallback (email, in-app inbox)? (Concern: notification reliability.)
- **In-app notification inbox:** push notifications are ephemeral; should v1 also surface a list of recent session confirmations inside the app for users who missed the push?

## Business Logic

GameSlot computes, for each candidate day + start-hour slot within a friend group, the set of members who have marked themselves available, and surfaces the slots with the largest overlap as the best candidates for the host to confirm a session at.

In product flow terms: each member contributes their own availability as input. The application then computes — for every slot any member has marked — how many members are available at that slot. The output is a per-slot count plus a visual emphasis on slots above a meaningful threshold (e.g. "most of the group is available here"). A host scanning the shared calendar sees the overlap surfaced inline rather than having to triangulate it manually, and confirms the session at one of the surfaced overlapping slots. The decision the app makes — for the user — is "which slots are worth even considering."

This rule is what distinguishes GameSlot from a generic group calendar or poll: a poll captures votes but does not interpret them; GameSlot interprets the marked availability into a ranking signal the host acts on.

**Surfacing.** Each slot in the calendar view displays an availability count badge (e.g. "3 / 5 available"). Slots whose count exceeds a meaningful threshold (definition deferred to design) are visually emphasized so the host's eye is drawn to them without filtering.

## Non-Functional Requirements

- **Privacy commitment.** A group's membership and its members' availability are visible only to members of that group. The app does not expose this data outside the group via search, public profile, or any other surface.
- **Mobile-first usability.** The shared calendar — including marking availability, viewing overlap counts, and confirming a session — is usable on a phone-sized screen.

## Non-Goals

These are explicitly out of scope for v1. They are NOT deferred-by-omission — they are deliberately ruled out so they can't sneak back in during implementation.

- **No in-app chat / messaging.** GameSlot is a coordination calendar, not a communications tool. If users need to discuss, they do so in their existing chats.
- **No board game library, game recommendations, or game-suggestion engine.** v1 answers "when do we play?", not "what do we play?". Game selection happens out-of-band.
- **No external calendar integration** (Google Calendar, Apple Calendar, iCal). v1 availability lives only in GameSlot. No sync, no import, no .ics export.
- **No voting system for games or dates.** The host decides which slot becomes the session — no group polling, no quorum logic.
- **No public discovery / group search.** Groups are invite-link-only. There is no directory, no search, no recommendation of groups to users.
- **No multi-time-zone support.** All members of a group share one local time zone; slots are stored and displayed as day + local hour. v1 does not translate slot times across zones.
- **No in-app notification inbox / history view.** v1 uses push only. Users who deny push permission do not see a notification log inside the app (this is logged in `## Open Questions` for v2 consideration).

## Forward: tech-stack

These hints surfaced during shaping and are NOT part of the PRD. They are captured here for the downstream stack-selection step.

- **PWA (Progressive Web App).** The user described the product as a PWA "compatible with Android and iOS" — i.e. a web app with install-to-home-screen and push notification support across both major mobile platforms. This implies: service worker, web app manifest, web push (with the iOS Safari caveats logged in Open Questions). Stack picks should preserve this product surface.



## User Stories

### US-01: Host confirms a session

**Given** a group exists, every member has signed in and joined the group, and several members have marked at least one overlapping availability slot,
**When** a member opens the group calendar, selects an overlapping slot, enters a meeting location, and confirms the session,
**Then** every member of the group receives a push notification containing the session's day, time, and location, and the confirming member is recorded as that session's host.

## Quality cross-check

Cross-check ran at the end of Phase 7. Result: **accepted** — no gaps.

- Access Control: present (Google OAuth + invite-link join + flat group / per-session host).
- Business Logic: present (overlap-computation rule, one declarative sentence).
- Project artifacts: present (shape-notes.md with valid frontmatter checkpoint).
- Timeline-cost acknowledged: present (mvp_weeks=3, inside the tight-budget envelope).
- Non-Goals: present (7 entries).

No Timeline acknowledgment block was needed because the chosen MVP budget is within the gate. The 4 Open Questions captured under `## Open Questions` are deferred design decisions, not gaps — `/10x-prd` should carry them forward.



