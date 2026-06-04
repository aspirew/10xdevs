import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// JSON POST unmark. Idempotent: DELETE on a non-existent row returns 200. Same
// past-slot stance as mark.ts (UI-only enforcement).
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json(401, { error: "Not authenticated" });

  const { id } = context.params;
  if (!id) return json(400, { error: "Missing group id" });

  let body: { slot_date?: unknown; slot_hour?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { slot_date, slot_hour } = body;
  if (typeof slot_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(slot_date)) {
    return json(400, { error: "slot_date must be YYYY-MM-DD" });
  }
  if (typeof slot_hour !== "number" || !Number.isInteger(slot_hour) || slot_hour < 0 || slot_hour > 23) {
    return json(400, { error: "slot_hour must be integer 0..23" });
  }

  const admin = createAdminClient();
  if (!admin) return json(500, { error: "Server misconfigured" });

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return json(403, { error: "Not a member of this group" });

  const { error } = await admin
    .from("availability")
    .delete()
    .eq("group_id", id)
    .eq("user_id", user.id)
    .eq("slot_date", slot_date)
    .eq("slot_hour", slot_hour);
  if (error) return json(500, { error: error.message });

  return json(200, { ok: true });
};
