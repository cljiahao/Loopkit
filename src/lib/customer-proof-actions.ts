"use server";
import { clearCustomerProof, vendorIdSchema } from "@/lib/customer-proof";
import type { ActionResult } from "@/lib/action-result";

export async function forgetCustomerProof(
  vendorId: string,
): Promise<ActionResult> {
  const vendor = vendorIdSchema.safeParse(vendorId);
  if (!vendor.success) return { success: false, error: "Invalid shop." };
  try {
    await clearCustomerProof(vendor.data);
    return { success: true };
  } catch {
    return {
      success: false,
      error: "Could not forget this saved card. Try again.",
    };
  }
}
