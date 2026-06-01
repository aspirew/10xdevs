import type { APIRoute } from "astro";
import { createAdminClient } from "@/lib/supabase-admin";

// KNOWN PLATFORM ISSUE (Phase 3.9 verification): this Supabase project's PostgREST
// does not honor JWTs signed with the asymmetric (ECC P-256 / ES256) keys — auth.uid()
// returns NULL even when a valid JWT is sent. RLS WITH CHECK on `to authenticated`
// policies therefore cannot be satisfied via the user-scoped supabase client.
// Workaround: use the admin (service-role) client + trust middleware's `locals.user`
// as the auth gate. App-layer security replaces the RLS gate; the RLS policies in
// supabase/migrations/20260601210816_groups_and_members.sql remain as defense-in-depth.
// See context/foundation/lessons.md → "Supabase asymmetric-JWT projects may break
// PostgREST auth.uid()".
export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Please sign in")}`);
  }

  const form = await context.request.formData();
  const rawName = form.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) {
    return context.redirect(`/groups/new?error=${encodeURIComponent("Group name is required")}`);
  }

  const admin = createAdminClient();
  if (!admin) {
    return context.redirect(`/groups/new?error=${encodeURIComponent("Supabase admin client is not configured")}`);
  }

  const { data: group, error: insertGroupError } = await admin
    .from("groups")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();

  if (insertGroupError) {
    return context.redirect(`/groups/new?error=${encodeURIComponent(insertGroupError.message)}`);
  }

  const { error: insertMemberError } = await admin
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id });

  if (insertMemberError) {
    // Best-effort cleanup: roll back the orphaned group so a retry succeeds cleanly.
    await admin.from("groups").delete().eq("id", group.id);
    return context.redirect(`/groups/new?error=${encodeURIComponent(insertMemberError.message)}`);
  }

  return context.redirect(`/groups/${group.id}`, 302);
};
