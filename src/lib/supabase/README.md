# supabase

## Purpose

Supabase client factories for each execution context (browser, Server
Component/Action, middleware), all pinned to the `loopkit` schema.

## Contents

- `client.ts` — `createClient()`: browser-side Supabase client via `createBrowserClient`, scoped to `db: { schema: "loopkit" }`. Passes `cookieOptions: { domain: process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN }` when that env var is set (Vercel Production only), scoping the auth cookie to `.merqo.io` so a session carries across every Merqo kit.
- `middleware.ts` — `updateSession()`: refreshes the auth session cookie on every request except the public `/c` customer view, redirects unauthenticated requests to `/login` for `/dashboard` and `/setup` paths, degrades to "unauthenticated" if `getUser()` throws. Also runs `clearLegacyHostOnlyCookie()`: a vendor signed in before the `.merqo.io` cookie domain shipped has a HOST-ONLY version of the same-named auth cookie, which the browser and Next's cookie parser can disagree on (RFC 6265 ordering) once the domain-scoped one also exists — the helper clears the host-only one once per browser (guarded by a `sb-auth-cookie-domain-migrated` marker cookie), skipping any cookie name `@supabase/ssr`'s own `setAll` just wrote this same request so it never clobbers a same-request token refresh.
- `server.ts` — `createServerClient()`: cookie-backed server client for Server Components/Actions (silently no-ops `setAll` in read-only contexts), same conditional `cookieOptions.domain` as `client.ts`; `createServiceClient()`: secret-key client with an empty cookie adapter that bypasses RLS entirely — for Server Actions/Route Handlers only, `cookieOptions` intentionally omitted since it never writes session cookies

## Parent

[lib](../README.md)
