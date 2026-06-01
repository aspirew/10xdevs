import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "astro:env/server";

// IMPORTANT: this client uses the service-role key and BYPASSES Row-Level Security.
// Use ONLY for narrow server-side cases where RLS would prevent legitimate access:
//   - invite-token lookup before sign-in (anonymous visitor can't read public.groups)
//   - joining auth.users for member email display (anon role has no access to auth.users)
// Never expose to client-side code or React islands. Server-only.
export function createAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
