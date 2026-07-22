import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";
import { formatSlotLabel, isIsoDate, isPastSlot } from "@/lib/calendar";
import { sendPushToUser } from "@/lib/push";
import type { Session } from "@/lib/sessions";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// POST /api/groups/[id]/sessions — confirm a session at (slot_date, slot_hour) with
// free-text location. UNIQUE (group_id, slot_date, slot_hour) enforces one-session-
// per-slot at the DB layer; a second confirm surfaces as Postgres code 23505 →
// translated to 409. After a successful insert the endpoint fans out one Web Push
// per group member (including the host — proves the pipeline on the initiator's
// own device, the best signal against iOS Safari flakiness). Fan-out failures are
// swallowed and logged; the session row is already committed.
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json(401, { error: "Not authenticated" });

  const { id } = context.params;
  if (!id) return json(400, { error: "Missing group id" });

  let body: { slot_date?: unknown; slot_hour?: unknown; location?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const { slot_date, slot_hour, location } = body;
  if (!isIsoDate(slot_date)) {
    return json(400, { error: "slot_date must be YYYY-MM-DD" });
  }
  if (typeof slot_hour !== "number" || !Number.isInteger(slot_hour) || slot_hour < 0 || slot_hour > 23) {
    return json(400, { error: "slot_hour must be integer 0..23" });
  }
  if (typeof location !== "string") {
    return json(400, { error: "location must be a string" });
  }
  const trimmedLocation = location.trim();
  if (trimmedLocation.length === 0) {
    return json(400, { error: "location must not be empty" });
  }
  if (isPastSlot(slot_date, slot_hour)) {
    return json(400, { error: "Cannot confirm a session in the past" });
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

  // Spec check (FR-009 "an availability slot"): at least one member must be
  // available at this slot under the start-hour semantic — their slot_hour must
  // be <= the requested slot_hour on slot_date. Rejects hand-rolled curls that
  // target empty slots the UI would never show as confirmable.
  const { data: availableRows, error: availErr } = await admin
    .from("availability")
    .select("user_id")
    .eq("group_id", id)
    .eq("slot_date", slot_date)
    .lte("slot_hour", slot_hour);
  if (availErr) return json(500, { error: availErr.message });
  if (availableRows.length === 0) {
    return json(400, { error: "No members are available at this slot" });
  }

  const { data: inserted, error: insertErr } = await admin
    .from("sessions")
    .insert({
      group_id: id,
      host_user_id: user.id,
      slot_date,
      slot_hour,
      location: trimmedLocation,
    })
    .select("id, group_id, host_user_id, slot_date, slot_hour, location, confirmed_at")
    .single();

  if (insertErr) {
    // supabase-js surfaces the Postgres unique_violation as `code: "23505"` on
    // the returned error object. Translate to 409 so the client dialog can
    // render the "already confirmed" message inline.
    if ((insertErr as { code?: string }).code === "23505") {
      return json(409, { error: "A session is already confirmed at this slot" });
    }
    return json(500, { error: insertErr.message });
  }
  const session: Session = inserted;

  // Fan-out is sequential to keep per-endpoint 410 cleanup ordered and avoid
  // concurrent writes hammering the same push_subscriptions rows. Small-group
  // scale (<= 10) makes serial cost negligible. Errors from sendPushToUser
  // (e.g., VAPID misconfig) are caught here so a broken push pipeline never
  // fails a confirmed session — the row is already in the DB by this point.
  const { data: members } = await admin.from("group_members").select("user_id").eq("group_id", id);
  const total = { sent: 0, failed: 0, deleted: 0 };
  const payload = {
    title: "Session confirmed",
    body: `${formatSlotLabel(session.slot_date, session.slot_hour)} · ${session.location}`,
    url: `/groups/${id}`,
    tag: `session-${session.id}`,
  };
  const memberRows = (members ?? []) as { user_id: string }[];
  for (const m of memberRows) {
    try {
      const r = await sendPushToUser(admin, m.user_id, payload);
      total.sent += r.sent;
      total.failed += r.failed;
      total.deleted += r.deleted;
    } catch (err) {
      console.warn("session", session.id, "→ fanout to", m.user_id, "threw:", (err as Error).message);
      total.failed += 1;
    }
  }
  console.log("session", session.id, `→ fanout: sent=${total.sent} failed=${total.failed} deleted=${total.deleted}`);

  return json(200, { ok: true, session });
};
