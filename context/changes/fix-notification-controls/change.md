---
change_id: fix-notification-controls
title: Fix invisible unsubscribe button and remove test-notification button
status: new
created: 2026-08-11
updated: 2026-08-11
archived_at: null
---

## Notes

Two issues on the notification-controls surface:

1. The "unsubscribe from notifications" button currently renders with a white background and white text — the label is invisible. Give it a variant/style that reads clearly against the surrounding surface.
2. Remove the "send test notification" button entirely. It was useful during PWA push bring-up but doesn't belong in the shipped UI.
