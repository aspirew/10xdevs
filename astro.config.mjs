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
    },
  },
});
