import { createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

/**
 * Append an admin-audit row (`loopkit.admin_audit`, migration `0003`).
 * Best-effort: a hiccup here must not fail the action it records, but it's
 * logged so a broken trail stays visible.
 *
 * `actorId` is normally the signed-in admin's `auth.uid()` (from
 * `requireAdmin()`). One caller has no real admin behind the action at all:
 * `POST /api/merqo/vendor-provision` is invoked by the merqo hub itself over
 * a bearer secret, not a signed-in admin. There, `actorId` is the vendor's
 * own `auth.users.id` (a value the FK on `admin_id` can always satisfy,
 * since it's the same id the row being provisioned belongs to) and the
 * caller stamps `detail.actor = "merqo_system"` as the documented sentinel
 * marking a system-attributed action rather than a real admin's — see
 * that route for the exact shape.
 */
export async function recordAudit(
  actorId: string,
  action: string,
  targetId: string | null,
  detail: Json,
): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase.from("admin_audit").insert({
    admin_id: actorId,
    action,
    target_id: targetId,
    detail,
  });
  if (error) console.error("admin_audit insert failed", error.message);
}
