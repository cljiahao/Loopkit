import type { SupabaseClient } from "@supabase/supabase-js";
import { callMerqoRpc } from "@/lib/merqo-rpc";

/**
 * Shape of the merqo.submit_support_message RPC — merqo owns this
 * function's real generated types; this is a hand-written mirror of the
 * RPC contract, not a generated type, since merqo.* is outside loopkit's
 * own supabase gen types scope (schema: "loopkit"). See
 * merqo/docs/superpowers/specs/2026-07-23-cross-kit-support-messages-remaining-kits-design.md.
 */
type SubmitSupportMessageArgs = {
  p_kit_slug: string;
  p_category: string;
  p_body: string;
};
type SubmitSupportMessageReturn = { id: string };

export async function submitSupportMessage<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  category: string,
  body: string,
): Promise<void> {
  await callMerqoRpc<
    SubmitSupportMessageArgs,
    SubmitSupportMessageReturn,
    Db,
    SchemaName
  >(supabase, "submit_support_message", {
    p_kit_slug: "loopkit",
    p_category: category,
    p_body: body,
  });
}
