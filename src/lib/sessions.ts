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

// Reads the earliest confirmed session at slot_date >= today for this group and
// resolves the host's email via auth.admin.getUserById so the banner can render
// "Hosted by <email>". Returns null when no future session exists.
//
// v1 banner scope is "next upcoming session only" — LIMIT 1 matches that.
// Multi-session UX is deferred until real friend groups start confirming more
// than one future session at a time.
export async function getNextUpcomingSession(admin: SupabaseClient, groupId: string): Promise<SessionWithHost | null> {
  const today = formatDate(new Date());
  const { data: rows, error } = await admin
    .from("sessions")
    .select("id, group_id, host_user_id, slot_date, slot_hour, location, confirmed_at")
    .eq("group_id", groupId)
    .gte("slot_date", today)
    .order("slot_date", { ascending: true })
    .order("slot_hour", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (rows as Session[] | null)?.[0];
  if (!row) return null;

  const { data: hostRecord } = await admin.auth.admin.getUserById(row.host_user_id);
  return { ...row, host_email: hostRecord.user?.email ?? null };
}
