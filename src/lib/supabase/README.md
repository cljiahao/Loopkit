# supabase

## Purpose

Supabase client factories for each execution context (browser, Server
Component/Action, middleware), all pinned to the `loopkit` schema.

## Contents

- `client.ts` — `createClient()`: browser-side Supabase client via `createBrowserClient`, scoped to `db: { schema: "loopkit" }`
- `middleware.ts` — `updateSession()`: refreshes the auth session cookie on every request except the public `/c` customer view, redirects unauthenticated requests to `/login` for `/dashboard` and `/setup` paths, degrades to "unauthenticated" if `getUser()` throws
- `server.ts` — `createServerClient()`: cookie-backed server client for Server Components/Actions (silently no-ops `setAll` in read-only contexts); `createServiceClient()`: secret-key client with an empty cookie adapter that bypasses RLS entirely — for Server Actions/Route Handlers only

## Parent

[lib](../README.md)
