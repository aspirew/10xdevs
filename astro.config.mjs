// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  site: "https://10xdevs-lilac.vercel.app",
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: vercel(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_ANON_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // New-format publishable key (sb_publishable_*). Vercel-Supabase integration writes
      // it under the NEXT_PUBLIC_ prefix; we use that name here so .env doesn't need a
      // second copy. Prefer this over SUPABASE_ANON_KEY for projects on asymmetric JWT
      // signing (ES256) — PostgREST's auth.uid() resolution depends on it matching the
      // project's active key format.
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_SECRET_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Web Push (F-02). Generate the keypair once via
      // `npx web-push generate-vapid-keys --json` and store in .env locally + Vercel Env
      // for Preview + Production. PUBLIC_VAPID_PUBLIC_KEY is the same string as
      // VAPID_PUBLIC_KEY — duplicated because Astro exposes `context: "client"` vars via
      // `import.meta.env.PUBLIC_*` and needs the schema declaration to permit that access.
      // This is the first genuinely client-context env var in the repo; existing NEXT_PUBLIC_
      // vars are declared server-only because they're never actually bundled to the browser.
      // VAPID public keys ARE safe to embed in the client bundle by design (RFC 8292).
      // All four kept `optional: true` so the app boots in dev without VAPID; push endpoints
      // hard-fail at call time if the keys are missing, which is the correct signal.
      VAPID_PUBLIC_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      VAPID_PRIVATE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      VAPID_SUBJECT: envField.string({ context: "server", access: "secret", optional: true }),
      PUBLIC_VAPID_PUBLIC_KEY: envField.string({ context: "client", access: "public", optional: true }),
    },
  },
});
