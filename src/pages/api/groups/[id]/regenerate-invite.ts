import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const { id } = context.params;
  if (!id) {
    return context.redirect(`/groups?error=${encodeURIComponent("Missing group id")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/groups/${id}?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const newToken = crypto.randomUUID();
  const { data, error } = await supabase.from("groups").update({ invite_token: newToken }).eq("id", id).select("id");

  if (error) {
    return context.redirect(`/groups/${id}?error=${encodeURIComponent(error.message)}`);
  }
  if (data.length === 0) {
    // RLS "groups: creator updates" policy blocked the write (non-creator),
    // or the group doesn't exist. Don't distinguish — both mean "you can't do this".
    return context.redirect(
      `/groups?error=${encodeURIComponent("Group not found or you don't have permission to regenerate its invite link")}`,
    );
  }

  return context.redirect(`/groups/${id}`, 302);
};
