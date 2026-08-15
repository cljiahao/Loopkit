// src/lib/pricing.ts
import { createServerClient } from "@/lib/supabase/server";
import type { Pricing } from "@/lib/types";

/** Shape the plan page + admin form consume (subset of the `pricing` row). */
export type PricingConfig = Pick<Pricing, "monthly_cents" | "currency">;

/**
 * Fallback when the `pricing` row can't be read (e.g. pre-migration, or a
 * transient read failure). Zeroed so a page renders without throwing — this
 * is a safety net, not loopkit's real price. In steady state the DB row
 * (seeded at 499 = $4.99, admin-tunable from /admin) is what every page
 * actually reads.
 */
export const DEFAULT_PRICING: PricingConfig = {
  monthly_cents: 0,
  currency: "SGD",
};

/** The live, admin-tunable price row. RLS is public-select, so this is safe
 * to call from any signed-in context (vendor plan page, admin page) with
 * the ordinary cookie-scoped client — no service-role client needed here. */
export async function getPricing(): Promise<PricingConfig> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("pricing")
    .select("monthly_cents, currency")
    .eq("id", 1)
    .maybeSingle();
  return data ?? DEFAULT_PRICING;
}
