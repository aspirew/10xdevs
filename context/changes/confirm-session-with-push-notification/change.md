---
change_id: confirm-session-with-push-notification
title: Confirm session with push notification
status: implementing
created: 2026-07-22
updated: 2026-07-22
archived_at: null
---

## Notes

- **2026-07-22 · UX shift during Phase 3 smoke.** The plan's Phase 3 specified long-press (pointer-hold ≥500ms on ≥1-marker cells) as the confirm affordance. Live smoke on Chrome + macOS surfaced that the gesture was undiscoverable and the pointer/click discrimination was fragile (clicks appeared dead at times). Replaced with an explicit ✓ button at the right of each day row. The button appears iff the host has marked their availability that day AND that mark is not in the past; clicking opens the dialog with slot=(day, host's start-hour). Progress rows 3.7/3.11/3.12 were rephrased to match; the Phase 3 Changes Required prose is left as originally written (phase blocks are read-only per the ritual). The `sessions.ts` helper and the endpoint are unchanged — the shift is purely UI-layer.
