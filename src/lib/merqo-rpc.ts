import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Structural stand-in for a single merqo.* RPC function's generated-types
 * shape. merqo owns the real generated types for its functions; TArgs/
 * TReturn are supplied per call site (one merqo.* function each), since
 * merqo.* is outside a caller kit's own `supabase gen types` scope.
 */
type MerqoRpcSchema<TArgs, TReturn> = {
  merqo: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, { Args: TArgs; Returns: TReturn }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/**
 * Call a merqo.* RPC function through a caller's own Supabase client.
 * Generic over the caller's Database/SchemaName so any concrete
 * "loopkit"-scoped client type flows in unchanged — a bare `SupabaseClient`
 * defaults its schema-name param to `"public"`, which such a client
 * doesn't structurally match. The body re-asserts the client against
 * `MerqoRpcSchema<TArgs, TReturn>` for the one cross-schema call. Throws
 * with the RPC name and Postgres error message on failure, so callers
 * don't each have to check `.error` themselves.
 */
export async function callMerqoRpc<
  TArgs,
  TReturn,
  Db,
  SchemaName extends string & Exclude<keyof Db, "__InternalSupabase">,
>(
  supabase: SupabaseClient<Db, SchemaName>,
  fnName: string,
  args: TArgs,
): Promise<TReturn> {
  const merqoClient = supabase as unknown as SupabaseClient<
    MerqoRpcSchema<TArgs, TReturn>
  >;
  // `fnName`/`args` re-cast to `never`: supabase-js's `.rpc()` overload
  // resolves its expected Args type via an indexed access into
  // `MerqoRpcSchema["Functions"]` keyed by a generic string, which TS
  // can't simplify back down to bare `TArgs` for assignability — the same
  // category of generic-indexed-access limitation the outer `as unknown as
  // SupabaseClient<...>` cast above already works around for the client
  // itself. `data`/`error` below are still concretely typed.
  const { data, error } = await merqoClient
    .schema("merqo")
    .rpc(fnName as never, args as never);
  if (error) {
    throw new Error(`${fnName} failed: ${error.message}`);
  }
  return data as TReturn;
}
