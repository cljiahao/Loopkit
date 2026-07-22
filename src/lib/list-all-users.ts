import type { createServiceClient } from "@/lib/supabase/server";

const LIST_USERS_PAGE_SIZE = 1000;
// Sanity ceiling, not a real expected limit — guards against an infinite loop
// if the admin API ever returns a full page forever (e.g. a GoTrue bug).
const LIST_USERS_MAX_PAGES = 50;

export type AdminAuthUser = { id: string; email: string | null };

/**
 * supabase.auth.admin.listUsers() paginates (1000 users/page) — fetch every
 * page so a vendor past the first 1000 auth users doesn't silently go
 * missing (the admin console's email lookup) or resolve as inactive (the
 * merqo vendor-status API) — both call sites made this same page-1-only
 * mistake independently. Stops at the first partial page (fewer than
 * perPage results), which per the GoTrue admin API always means the last
 * page. Mirrors the {data, error} shape of a single listUsers() call so
 * callers' existing error-checking pattern doesn't need to change.
 */
export async function listAllUsers(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<{
  data: { users: AdminAuthUser[] } | null;
  error: { message: string } | null;
}> {
  const users: AdminAuthUser[] = [];
  for (let page = 1; page <= LIST_USERS_MAX_PAGES; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PAGE_SIZE,
    });
    if (error) return { data: null, error };
    users.push(
      ...data.users.map((u) => ({ id: u.id, email: u.email ?? null })),
    );
    if (data.users.length < LIST_USERS_PAGE_SIZE) break;
  }
  return { data: { users }, error: null };
}
