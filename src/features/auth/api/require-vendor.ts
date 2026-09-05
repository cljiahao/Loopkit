import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { requireCurrentLegalAcceptance } from "@/lib/legal-gate";

// Shared vendor gate for server components/actions. Unlike merqo's
// requireVendor (notFound — vendor identity is looked up by email in a
// separate catalog table), loopkit has no such catalog: an unauthenticated
// request just needs to sign in, so we redirect to /login instead.
// loopkit's single gate entry point — the legal-acceptance check lives here
// once, not duplicated per call site (unlike qkit's three-site pattern).
export async function requireVendor(): Promise<{ user: User }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  await requireCurrentLegalAcceptance(user.email);
  return { user };
}
