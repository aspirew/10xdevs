import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate } from "@/lib/calendar";

// Sessions live one row per (group, slot). UNIQUE (group_id, slot_date, slot_hour)
// is enforced at the DB layer; the confirm endpoint catches error code 23505 and
// returns 409. Composite FK to group_members(group_id, user_id) means a leaving
// host cascades away with their session (matches the availability shape).
//
// Membership checks are ALWAYS at the JS layer in admin-client paths (see
// lessons.md #2). RLS on `sessions` exists for defense-in-depth against direct
// PostgREST traffic, never as the operative gate. Callers of the helper below
// are expected to have gated on `locals.user` + `group_members` before invoking.

export interface Session {
  id: string;
  group_id: string;
  host_user_id: string;
  slot_date: string;
  slot_hour: number;
  location: string;
  confirmed_at: string;
}

export interface SessionWithHost extends Session {
  host_email: string | null;
}

// Reads all future confirmed sessions for a group (slot_date >= today), ordered
// earliest-first, with each host's email resolved in parallel via
// auth.admin.getUserById. The banner reads [0] (single next-upcoming session);
// the calendar renders ★ badges for every entry in the visible window and
// drives the per-viewer host-only ✗ cancel affordance.
export async function getUpcomingSessions(admin: SupabaseClient, groupId: string): Promise<SessionWithHost[]> {
  const today = formatDate(new Date());
  const { data: rows, error } = await admin
    .from("sessions")
    .select("id, group_id, host_user_id, slot_date, slot_hour, location, confirmed_at")
    .eq("group_id", groupId)
    .gte("slot_date", today)
    .order("slot_date", { ascending: true })
    .order("slot_hour", { ascending: true });
  if (error) throw new Error(error.message);
  const sessions = (rows as Session[] | null) ?? [];
  if (sessions.length === 0) return [];

  const hostEmails = await Promise.all(
    sessions.map(async (s) => {
      const { data: hostRecord } = await admin.auth.admin.getUserById(s.host_user_id);
      return hostRecord.user?.email ?? null;
    }),
  );
  return sessions.map((s, i) => ({ ...s, host_email: hostEmails[i] }));
}
