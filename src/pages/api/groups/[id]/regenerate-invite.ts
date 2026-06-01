import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";

// See /api/groups/index.ts for context on why admin-client + app-layer auth replaces
// the user-scoped client + RLS gate (broken PostgREST auth.uid() in this project).
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Please sign in")}`);
  }

  const { id } = context.params;
  if (!id) {
    return context.redirect(`/groups?error=${encodeURIComponent("Missing group id")}`);
  }

  const admin = createAdminClient();
  if (!admin) {
    return context.redirect(`/groups/${id}?error=${encodeURIComponent("Supabase admin client is not configured")}`);
  }

  // App-layer creator check (replaces RLS "groups: creator updates" policy).
  const { data: group, error: lookupError } = await admin
    .from("groups")
    .select("created_by")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return context.redirect(`/groups?error=${encodeURIComponent(lookupError.message)}`);
  }
  if (!group) {
    return context.redirect(`/groups?error=${encodeURIComponent("Group not found")}`);
  }
  if (group.created_by !== user.id) {
    return context.redirect(
      `/groups/${id}?error=${encodeURIComponent("Only the group creator can regenerate the invite link")}`,
    );
  }

  const newToken = crypto.randomUUID();
  const { error: updateError } = await admin.from("groups").update({ invite_token: newToken }).eq("id", id);

  if (updateError) {
    return context.redirect(`/groups/${id}?error=${encodeURIComponent(updateError.message)}`);
  }

  return context.redirect(`/groups/${id}`, 302);
};
