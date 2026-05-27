import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

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

  return context.redirect("/", 302);
};
