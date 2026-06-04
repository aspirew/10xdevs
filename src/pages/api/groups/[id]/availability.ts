import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAvailabilityWindow } from "@/lib/availability";
import { isIsoDate } from "@/lib/calendar";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// JSON GET: returns the per-slot overlap window for week-nav. Auth + JS-level membership
// check (RLS isn't the gate on this project — see lessons.md). Used only by the React
// island; initial server render calls getAvailabilityWindow directly.
export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json(401, { error: "Not authenticated" });

  const { id } = context.params;
  if (!id) return json(400, { error: "Missing group id" });

  const start = context.url.searchParams.get("start");
  const end = context.url.searchParams.get("end");
  if (!isIsoDate(start) || !isIsoDate(end)) {
    return json(400, { error: "start/end must be YYYY-MM-DD" });
  }
  if (end < start) return json(400, { error: "end must be >= start" });
  const days = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
  if (days > 31) return json(400, { error: "Range too wide (max 31 days)" });

  const admin = createAdminClient();
  if (!admin) return json(500, { error: "Server misconfigured" });

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return json(403, { error: "Not a member of this group" });

  try {
    const data = await getAvailabilityWindow(admin, id, start, end);
    return json(200, data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Query failed";
    return json(500, { error: msg });
  }
};
