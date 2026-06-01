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

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  const providerError = context.url.searchParams.get("error_description") ?? context.url.searchParams.get("error");

  if (providerError) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(providerError)}`);
  }
  if (!code) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Missing OAuth code")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(exchangeError.message)}`);
  }

  // Read the pending-next cookie set by /api/auth/oauth/google (see comment there
  // for why this is a cookie hand-off rather than a `?next=` query thread-through).
  // Validate same-origin again as defense-in-depth, then clear the cookie.
  const pendingNext = context.cookies.get(PENDING_OAUTH_NEXT_COOKIE)?.value ?? null;
  context.cookies.delete(PENDING_OAUTH_NEXT_COOKIE, { path: "/" });

  const target = isSafeSameOriginPath(pendingNext, context.url.origin) ? pendingNext : "/";
  return context.redirect(target, 302);
};
