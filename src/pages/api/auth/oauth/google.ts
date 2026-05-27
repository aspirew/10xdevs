import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const redirectTo = new URL("/auth/callback", context.url.origin).toString();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error || !data.url) {
    return context.redirect(
      `/auth/signin?error=${encodeURIComponent(error?.message ?? "Failed to initiate Google sign-in")}`,
    );
  }

  return context.redirect(data.url, 302);
};
