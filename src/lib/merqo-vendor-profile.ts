import type { SupabaseClient } from "@supabase/supabase-js";
import { callMerqoRpc } from "@/lib/merqo-rpc";

/**
 * Shape returned by merqo's get_or_create_vendor_profile. merqo owns this
 * table's real generated types — this is a hand-written mirror of the RPC
 * contract, not a generated type, since merqo.* is outside loopkit's own
 * supabase gen types scope (schema: "loopkit").
 */
export type VendorProfile = {
  vendor_id: string;
  stall_name: string;
  social_links: Record<string, string>;
  created_at: string;
  updated_at: string;
};

type GetOrCreateVendorProfileArgs = {
  p_vendor_id: string;
  p_default_stall_name: string | null;
};
type UpsertVendorProfileArgs = {
  p_vendor_id: string;
  p_stall_name: string;
  p_social_links: Record<string, string>;
};

/**
 * Callers pass in a client already scoped to their own (loopkit) Database
 * and schema name — this file must accept whatever concrete instantiation
 * that is. A bare `SupabaseClient` defaults its schema-name param to
 * `"public"`, which real callers (scoped to `"loopkit"`) don't structurally
 * match. Declaring the function generic over the caller's own
 * Database/SchemaName lets each call site's concrete client type flow in
 * unchanged; `callMerqoRpc` re-asserts it against the merqo schema for the
 * one cross-schema call.
 */
export async function getOrCreateVendorProfile<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorId: string,
  defaultStallName: string | null,
): Promise<VendorProfile> {
  return callMerqoRpc<
    GetOrCreateVendorProfileArgs,
    VendorProfile,
    Db,
    SchemaName
  >(supabase, "get_or_create_vendor_profile", {
    p_vendor_id: vendorId,
    p_default_stall_name: defaultStallName,
  });
}

/**
 * Update the vendor's shared merqo.vendor_profile row (stall name +
 * social links). Mirrors qkit's implementation exactly — same RPC,
 * same generic Db/SchemaName pattern as getOrCreateVendorProfile above.
 */
export async function upsertVendorProfile<
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  vendorId: string,
  stallName: string,
  socialLinks: Record<string, string>,
): Promise<VendorProfile> {
  return callMerqoRpc<UpsertVendorProfileArgs, VendorProfile, Db, SchemaName>(
    supabase,
    "upsert_vendor_profile",
    {
      p_vendor_id: vendorId,
      p_stall_name: stallName,
      p_social_links: socialLinks,
    },
  );
}
