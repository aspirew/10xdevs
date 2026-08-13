---
change_id: google-only-signin-and-name-display
title: Google-only sign-in, conditional landing CTA, member name display
status: archived
created: 2026-08-14
updated: 2026-08-14
archived_at: 2026-08-13T22:23:05Z
---

## Notes

Drop sign-up entirely (Topbar, landing, /auth/signin footer, delete /auth/signup route + SignUpForm). Google OAuth is the only sign-in path. Landing page CTA becomes conditional: signed-out shows Sign in, signed-in shows "Go to groups" plus a "Hello [name]" caption sourced from Google's user_metadata.full_name. Groups detail page displays members as "Name (email)" using full_name from auth.users.
