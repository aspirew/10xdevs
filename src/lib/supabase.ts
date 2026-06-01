import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } from "astro:env/server";

// Prefer the new-format publishable key (sb_publishable_*) when the project has migrated
// to asymmetric JWT signing (ES256). PostgREST in such projects validates against the
// publishable apikey rather than the legacy HS256 anon JWT — falling back to the legacy
// SUPABASE_ANON_KEY makes the change reversible if the new key is missing for any reason.
const apikey = NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_ANON_KEY;

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !apikey) {
    return null;
  }
  return createServerClient(SUPABASE_URL, apikey, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "").map(({ name, value }) => ({
          name,
          value: value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
  });
}
