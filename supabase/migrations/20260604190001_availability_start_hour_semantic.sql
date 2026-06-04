-- Correct the availability semantic from "discrete hour pick" to "start-hour" per
-- PRD FR-006: "A group member can mark themselves available for a day + start-hour
-- slot." The original migration's PK included slot_hour, allowing multiple rows per
-- (group, user, date) — that modeled each hour as a discrete pick. PRD intent is
-- ONE start time per member per day, with availability lasting from that hour to
-- end-of-day; overlap surfacing counts members whose start_hour <= H at each cell.
--
-- This migration:
--   1) truncates availability (test data only at this point — caught mid-implement
--      of S-02 before any production data existed),
--   2) drops the old composite PK,
--   3) adds the corrected PK over (group_id, user_id, slot_date).
-- slot_hour remains a column (the start time) with its 0..23 check intact.

truncate table public.availability;
alter table public.availability drop constraint availability_pkey;
alter table public.availability add primary key (group_id, user_id, slot_date);
