"use server";

import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { requireVendor } from "./require-vendor";
import { createServerClient } from "@/lib/supabase/server";
import {
  getOrCreateVendorProfile,
  upsertVendorProfile,
} from "@/lib/merqo-vendor-profile";

const nameSchema = z.string().trim().min(1).max(60);

// Unverified name+phone vendor onboarding (spec:
// 2026-07-11-vendor-phone-onboarding-design.md, Option 1). Called after the
// client has already established an anonymous session via
// signInAnonymously() — requireVendor() here just reads that session, it
// does not create one. Phone is stored as vendor-supplied data, not a
// verified credential — same trust model as a customer typing their own
// number at /c today. The typed name is this vendor's first stall name —
// written straight to the shared merqo.vendor_profile row (same RPC path as
// /dashboard/profile's save action), not to loopkit.vendors, which only
// keeps `phone` now.
export async function vendorPhoneOnboardAction(
  name: string,
  phoneRaw: string,
): Promise<{ error?: string }> {
  const { user } = await requireVendor();

  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { error: "Enter your name." };

  const phone = normalizePhone(phoneRaw);
  if (!phone.ok) return { error: "Enter a valid Singapore phone number." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("vendors")
    .upsert(
      { vendor_id: user.id, phone: phone.phone },
      { onConflict: "vendor_id" },
    );
  if (error) return { error: "Couldn't save your details. Try again." };

  try {
    const current = await getOrCreateVendorProfile(supabase, user.id, null);
    await upsertVendorProfile(
      supabase,
      user.id,
      parsedName.data,
      current.social_links,
    );
  } catch (err) {
    console.error(
      "vendorPhoneOnboardAction: shared vendor profile write failed",
      err instanceof Error ? err.message : err,
    );
    return { error: "Couldn't save your details. Try again." };
  }

  return {};
}
