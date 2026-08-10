---
change_id: rename-notifications-and-drop-install
title: Rename "Notifications" menu to "Settings"; drop signed-out "Install" item
status: new
created: 2026-08-11
updated: 2026-08-11
archived_at: null
---

## Notes

Two related menu changes:

1. For signed-in users, rename the "Notifications" menu item to "Settings". The screen behind it already covers more than just notification prefs, so the label should reflect that.
2. For signed-out users, that same slot currently shows an "Install" entry. Remove it entirely — not re-label, not conditionally hide, just drop it. The install affordance can live elsewhere (or be re-added later as a proper PWA prompt).
