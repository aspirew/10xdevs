import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

const PENDING_OAUTH_NEXT_COOKIE = "pending_oauth_next";

function isSafeSameOriginPath(next: string | null, origin: string): next is string {
  if (!next) return false;
  try {
    return new URL(next, origin).origin === origin;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Hand-off path for post-sign-in destination (e.g. /invite/<token>):
  // store the validated `next` in a short-lived cookie, NOT in the OAuth
  // redirectTo query string. Supabase's redirect-URL allowlist matches the
  // FULL URL including query params (verified empirically via lessons.md
  // rule #1 / plan-review F4); appending `?next=...` causes Supabase to
  // reject the redirectTo and fall back to the Site URL.
  //
  // SameSite=Lax is required so the cookie survives the cross-origin
  // round-trip through Google + Supabase and is sent back to /auth/callback.
  const form = await context.request.formData();
  const rawNext = form.get("next");
  const nextCandidate = typeof rawNext === "string" ? rawNext : null;
  if (isSafeSameOriginPath(nextCandidate, context.url.origin)) {
    context.cookies.set(PENDING_OAUTH_NEXT_COOKIE, nextCandidate, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      maxAge: 300,
      path: "/",
    });
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
