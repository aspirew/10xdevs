import type { SupabaseClient } from "@supabase/supabase-js";

export interface AvailabilitySlot {
  slot_date: string;
  slot_hour: number;
  count: number;
}

export interface MyMark {
  slot_date: string;
  slot_hour: number;
}

export interface AvailabilityWindow {
  slots: AvailabilitySlot[];
  myMarks: MyMark[];
  groupSize: number;
  threshold: number;
}

// Shared read helper used by both the server-render path in groups/[id].astro and the
// JSON GET endpoint. Caller MUST verify group membership at the JS layer before invoking;
// this helper does NOT enforce auth (RLS isn't the gate on this project — see lessons.md
// "Verify PostgREST honors auth.uid()..."). At v1 friend-group scale (<10 members ×
// 28 days × 24 hours ≈ 6.7k rows max) the row-pull + JS aggregation is cheaper than
// shipping a Postgres function for COUNT/GROUP BY.
export async function getAvailabilityWindow(
  admin: SupabaseClient,
  groupId: string,
  userId: string,
  startDate: string,
  endDate: string,
): Promise<AvailabilityWindow> {
  const { data: rows, error: rowsErr } = await admin
    .from("availability")
    .select("slot_date, slot_hour, user_id")
    .eq("group_id", groupId)
    .gte("slot_date", startDate)
    .lte("slot_date", endDate);
  if (rowsErr) throw rowsErr;

  const countMap = new Map<string, number>();
  const myMarks: MyMark[] = [];
  for (const r of rows as { slot_date: string; slot_hour: number; user_id: string }[]) {
    const key = `${r.slot_date}T${r.slot_hour}`;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
    if (r.user_id === userId) {
      myMarks.push({ slot_date: r.slot_date, slot_hour: r.slot_hour });
    }
  }

  const slots: AvailabilitySlot[] = [];
  for (const [key, count] of countMap.entries()) {
    const [slot_date, hourStr] = key.split("T");
    slots.push({ slot_date, slot_hour: Number(hourStr), count });
  }

  const { count: groupSize, error: sizeErr } = await admin
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", groupId);
  if (sizeErr) throw sizeErr;
  if (groupSize === null) throw new Error("group_members count returned null");

  const threshold = Math.ceil((groupSize * 2) / 3);

  return { slots, myMarks, groupSize, threshold };
}
