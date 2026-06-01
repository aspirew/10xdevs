import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/new?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const rawName = form.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!name) {
    return context.redirect(`/groups/new?error=${encodeURIComponent("Group name is required")}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Please sign in")}`);
  }

  const { data: group, error: insertGroupError } = await supabase
    .from("groups")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();

  if (insertGroupError) {
    return context.redirect(`/groups/new?error=${encodeURIComponent(insertGroupError.message)}`);
  }

  const { error: insertMemberError } = await supabase
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id });

  if (insertMemberError) {
    // Best-effort cleanup: roll back the orphaned group so a retry succeeds cleanly.
    await supabase.from("groups").delete().eq("id", group.id);
    return context.redirect(`/groups/new?error=${encodeURIComponent(insertMemberError.message)}`);
  }

  return context.redirect(`/groups/${group.id}`, 302);
};
