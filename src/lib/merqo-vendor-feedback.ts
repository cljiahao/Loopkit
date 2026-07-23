import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shape of the merqo.submit_vendor_feedback RPC — merqo owns this
 * function's real generated types; this is a hand-written mirror of the
 * RPC contract, not a generated type, since merqo.* is outside loopkit's
 * own supabase gen types scope (schema: "loopkit"). See
 * merqo/docs/superpowers/specs/2026-07-23-cross-kit-vendor-feedback-design.md.
 */
type MerqoVendorFeedbackSchema = {
  merqo: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      submit_vendor_feedback: {
        Args: { p_kit_slug: string; p_nps: number; p_message: string | null };
        Returns: { id: string };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/**
 * Callers pass in a client already scoped to their own (loopkit) Database
 * and schema name — same generic-over-caller's-client pattern as
 * merqo-vendor-profile.ts, for the same reason (a bare SupabaseClient
 * defaults its schema-name param to "public", which a real caller scoped
 * to "loopkit" doesn't structurally match).
 */
export async function submitVendorFeedback<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  kitSlug: string,
  nps: number,
  message: string | null,
): Promise<void> {
  const merqoClient =
    supabase as unknown as SupabaseClient<MerqoVendorFeedbackSchema>;
  const { error } = await merqoClient
    .schema("merqo")
    .rpc("submit_vendor_feedback", {
      p_kit_slug: kitSlug,
      p_nps: nps,
      p_message: message,
    });
  if (error) {
    throw new Error(`submit_vendor_feedback failed: ${error.message}`);
  }
}
