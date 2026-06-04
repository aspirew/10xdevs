import type { SupabaseClient } from "@supabase/supabase-js";

// One row per (group_id, user_id, slot_date) after the start-hour semantic migration.
// `slot_hour` is the member's START hour for that date — their availability lasts from
// that hour to end of day. Overlap at any (date, hour) cell = members whose start_hour
// is <= hour on that date.

export interface MemberMark {
  slot_date: string;
  slot_hour: number;
}

// Shape sent to the client. user_ids are NOT exposed on the wire — the helper splits
// marks into "yours" vs "others" server-side so the React island can render your own
// start distinctly without knowing the identities of other members. Privacy posture
// per PRD §NFR is "members see each other's availability"; we still don't leak more
// than the rendering contract requires.
export interface AvailabilityWindow {
  myMarks: MemberMark[];
  othersMarks: MemberMark[];
  groupSize: number;
  threshold: number;
}

// Caller MUST verify group membership at the JS layer before invoking. The helper does
// not enforce auth (RLS isn't the gate on this project — see lessons.md).
//
// `groupSize` is optional: pass it when the caller already has it (e.g., the Astro
// page just pulled the member list for the Members section) to skip a redundant
// COUNT query. When omitted, the helper runs its own count.
export async function getAvailabilityWindow(
  admin: SupabaseClient,
  groupId: string,
  userId: string,
  startDate: string,
  endDate: string,
  groupSize?: number,
): Promise<AvailabilityWindow> {
  const { data: rows, error: rowsErr } = await admin
    .from("availability")
    .select("user_id, slot_date, slot_hour")
    .eq("group_id", groupId)
    .gte("slot_date", startDate)
    .lte("slot_date", endDate);
  if (rowsErr) throw rowsErr;

  const myMarks: MemberMark[] = [];
  const othersMarks: MemberMark[] = [];
  for (const r of rows as { user_id: string; slot_date: string; slot_hour: number }[]) {
    const entry: MemberMark = { slot_date: r.slot_date, slot_hour: r.slot_hour };
    if (r.user_id === userId) myMarks.push(entry);
    else othersMarks.push(entry);
  }

  let resolvedSize = groupSize;
  if (resolvedSize === undefined) {
    const { count, error: sizeErr } = await admin
      .from("group_members")
      .select("*", { count: "exact", head: true })
      .eq("group_id", groupId);
    if (sizeErr) throw sizeErr;
    if (count === null) throw new Error("group_members count returned null");
    resolvedSize = count;
  }

  const threshold = Math.ceil((resolvedSize * 2) / 3);

  return { myMarks, othersMarks, groupSize: resolvedSize, threshold };
}
