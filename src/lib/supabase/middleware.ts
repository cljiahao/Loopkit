import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

// Only these prefixes need a session; everything else (the landing page, the
// login page, and the public customer stamp-card view) is public.
function isProtectedPath(path: string): boolean {
  return path.startsWith("/dashboard") || path.startsWith("/setup");
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database, "loopkit">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
      db: { schema: "loopkit" },
    },
  );

  const path = request.nextUrl.pathname;

  // The public customer stamp-card view is anonymous and hot — don't spend an
  // auth round-trip (or risk an auth-outage 500) on it.
  if (path === "/c" || path.startsWith("/c/")) return supabaseResponse;

  // Refresh the session on every other request. @supabase/ssr rotates the auth
  // cookies as a side effect of getUser(); skipping it on public routes (the
  // landing, /login) lets the token age out with no refresh, which silently
  // logs the vendor out when they return. Resolve the user first, then apply
  // the login gate only for protected paths.
  let user: User | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth unreachable — degrade to "unauthenticated".
    user = null;
  }

  if (!user && isProtectedPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
