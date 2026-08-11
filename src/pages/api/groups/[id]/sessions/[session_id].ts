import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";
import { formatSlotLabel } from "@/lib/calendar";
import { sendPushToUser } from "@/lib/push";

interface SessionSummary {
  id: string;
  group_id: string;
  host_user_id: string;
  slot_date: string;
  slot_hour: number;
  location: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// DELETE /api/groups/[id]/sessions/[session_id] — cancel a confirmed session.
// Only the session's host may call this; the endpoint fetches the row (scoped
// to the URL's group_id, so a session_id from a different group returns 404
// rather than a leaky "wrong group" error), checks the host equality against
// locals.user, deletes the row, then fans out a "Session cancelled" push to
// every group member (including the cancelling host — symmetric with S-03's
// confirm fan-out; best signal that the pipeline worked from the initiator's
// perspective). Fan-out failures are caught and logged; the row is already
// gone by that point so a broken push pipeline never leaves the DB
// inconsistent.
export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json(401, { error: "Not authenticated" });

  const { id, session_id } = context.params;
  if (!id) return json(400, { error: "Missing group id" });
  if (!session_id) return json(400, { error: "Missing session id" });

  const admin = createAdminClient();
  if (!admin) return json(500, { error: "Server misconfigured" });

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return json(403, { error: "Not a member of this group" });

  // Fetch scoped to the URL's group_id — a session_id from a different group
  // looks the same as "session not found" from the caller's perspective.
  const { data: fetched, error: fetchErr } = await admin
    .from("sessions")
    .select("id, group_id, host_user_id, slot_date, slot_hour, location")
    .eq("id", session_id)
    .eq("group_id", id)
    .maybeSingle();
  if (fetchErr) return json(500, { error: fetchErr.message });
  if (!fetched) return json(404, { error: "Session not found" });
  const session: SessionSummary = fetched;

  if (session.host_user_id !== user.id) {
    return json(403, { error: "Only the session host can cancel" });
  }

  const { error: deleteErr } = await admin.from("sessions").delete().eq("id", session_id);
  if (deleteErr) return json(500, { error: deleteErr.message });

  // Fan-out: one push per group member, including the cancelling host.
  // Sequential per S-03 convention (small-group scale + ordered per-endpoint
  // 410 cleanup). Same tag as the confirm push so the OS collapses/replaces
  // any still-visible "Session confirmed" notification for this session.
  const { data: members } = await admin.from("group_members").select("user_id").eq("group_id", id);
  const total = { sent: 0, failed: 0, deleted: 0 };
  const payload = {
    title: "Session cancelled",
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
      console.warn("session", session.id, "→ cancel fanout to", m.user_id, "threw:", (err as Error).message);
      // +=1 is correct only because sendPushToUser can throw only BEFORE it
      // iterates this user's push_subscriptions. If push.ts is ever
      // refactored to throw mid-iteration, revisit this to look up the
      // caller's subscription count instead.
      total.failed += 1;
    }
  }
  console.log(
    "session",
    session.id,
    `→ cancel fanout: sent=${total.sent} failed=${total.failed} deleted=${total.deleted}`,
  );

  return json(200, { ok: true });
};
