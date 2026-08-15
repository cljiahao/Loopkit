// src/app/admin/pricing-form-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PricingForm } from "@merqo/ui";
import { setPricing } from "./actions";

const FIELDS = [{ key: "monthly_cents", label: "Monthly (SGD)" }];

/**
 * Thin client wrapper around @merqo/ui's presentational PricingForm — owns
 * the toast + router.refresh() side effects the component itself
 * deliberately doesn't (no `toast` import inside PricingForm; success/
 * failure surfaces via onSave resolving / onError firing). Matches this
 * admin surface's existing wrapper pattern (VendorProToggle,
 * ResolveUpgradeRequestButton).
 */
export function PricingFormClient({
  initial,
}: {
  initial: { monthly_cents: number; currency: string };
}) {
  const router = useRouter();

  async function onSave(values: Record<string, number>) {
    const res = await setPricing({ monthly_cents: values.monthly_cents });
    if (!res.success) throw new Error(res.error);
    toast.success("Pricing updated");
    router.refresh();
  }

  return (
    <PricingForm
      fields={FIELDS}
      initial={{
        values: { monthly_cents: initial.monthly_cents },
        currency: initial.currency,
      }}
      onSave={onSave}
      onError={(err) =>
        toast.error(
          err instanceof Error ? err.message : "Could not update pricing",
        )
      }
      helpText="Shown on the vendor plan page."
    />
  );
}
