import type { SupabaseClient } from "@supabase/supabase-js";

// One row per (group_id, user_id, slot_date) after the start-hour semantic migration.
// `slot_hour` is the member's START hour for that date — their availability lasts from
// that hour to end of day. Overlap at any (date, hour) cell = members whose start_hour
// is <= hour on that date.

export interface MemberMark {
  user_id: string;
  slot_date: string;
  slot_hour: number;
}

export interface AvailabilityWindow {
  marks: MemberMark[];
  groupSize: number;
  threshold: number;
}

// Caller MUST verify group membership at the JS layer before invoking. The helper does
// not enforce auth (RLS isn't the gate on this project — see lessons.md).
export async function getAvailabilityWindow(
  admin: SupabaseClient,
  groupId: string,
  startDate: string,
  endDate: string,
): Promise<AvailabilityWindow> {
  const { data: rows, error: rowsErr } = await admin
    .from("availability")
    .select("user_id, slot_date, slot_hour")
    .eq("group_id", groupId)
    .gte("slot_date", startDate)
    .lte("slot_date", endDate);
  if (rowsErr) throw rowsErr;

  const marks = rows as MemberMark[];

  const { count: groupSize, error: sizeErr } = await admin
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId);
  if (sizeErr) throw sizeErr;
  if (groupSize === null) throw new Error("group_members count returned null");

  const threshold = Math.ceil((groupSize * 2) / 3);

  return { marks, groupSize, threshold };
}
