---
change_id: compact-time-slots-table
title: Compact the time-slots table for mobile
status: implemented
created: 2026-08-11
updated: 2026-08-11
archived_at: null
---

## Notes

The time-slots table is too big, especially on mobile. Three adjustments:

1. Constrain the hour range to 10:00–20:00 (drop everything outside).
2. Show fewer days at once — target ~7 days visible at a time instead of the current window.
3. Remove all inline hints/tooltips inside the table. The interaction is intuitive enough without them; the hints add noise.
