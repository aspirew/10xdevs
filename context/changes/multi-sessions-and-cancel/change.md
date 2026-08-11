---
change_id: multi-sessions-and-cancel
title: Multiple sessions per group + host-only session cancellation
status: implemented
created: 2026-08-11
updated: 2026-08-11
archived_at: null
---

## Notes

Allow multiple confirmed sessions per group at different slots (any member can propose additional sessions — not just the current session's host). Banner still shows the next upcoming session. Add a cancel affordance: replace the ✓ button on the confirmed-session's day-row with a ✗ (cancel) button visible only to that session's host. Cancelling the session sends a proper push notification ("Session cancelled" + slot/location) to every group member.
