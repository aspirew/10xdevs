import type { APIRoute } from "astro";
import { VAPID_PUBLIC_KEY } from "astro:env/server";

// The SW is a static file with no build-time env access, so its
// `pushsubscriptionchange` handler fetches this endpoint to get the VAPID
// public key at re-subscribe time. Public by design (RFC 8292). Cached for
// an hour — key rotations require a fresh SW anyway.
export const GET: APIRoute = () => {
  return new Response(JSON.stringify({ key: VAPID_PUBLIC_KEY ?? "" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
