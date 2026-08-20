"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireVendor } from "@/features/auth";
import { getProgramById } from "@/lib/program";
import { normalizePhone } from "@/lib/phone";
import { referralLink } from "@/lib/referrals";
import { qrSvg } from "@/lib/qr";
import { createServerClient } from "@/lib/supabase/server";
import type { CreateReferralHostState } from "./types";

const labelSchema = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().trim().max(60).optional(),
);

// Create a referral host: a vendor names one of their own active programs
// plus a host's phone (the bride/groom/organizer who chose this vendor),
// and gets back a shareable /c?ref= link. Every distinct guest who joins
// through that link bumps the host one stamp/visit on the named program —
// see loopkit.vendor_join_referred (supabase/migrations/0040) for the
// credit-routing logic itself; this action only creates the row.
export async function createReferralHostAction(
  _prev: CreateReferralHostState,
  formData: FormData,
): Promise<CreateReferralHostState> {
  const { user } = await requireVendor();

  const programId = String(formData.get("program_id") ?? "").trim();
  if (!programId) {
    return { status: "error", message: "Pick a program." };
  }
  const program = await getProgramById(programId);
  if (!program || !program.active) {
    return { status: "error", message: "Pick an active program." };
  }

  const normalized = normalizePhone(String(formData.get("host_phone") ?? ""));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Enter a valid Singapore phone number.",
    };
  }

  const label = labelSchema.parse(formData.get("label")) ?? null;

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("referral_hosts")
    .insert({
      vendor_id: user.id,
      program_id: programId,
      host_phone: normalized.phone,
      label,
    })
    .select("id,referral_code,guest_count")
    .single();
  if (error || !data) {
    console.error("createReferralHostAction failed", error);
    return { status: "error", message: "Something went wrong. Try again." };
  }

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const link = referralLink(origin, user.id, data.referral_code);

  revalidatePath("/dashboard/referrals");
  return {
    status: "created",
    host: {
      id: data.id,
      programId,
      programName: program.name,
      hostPhone: normalized.phone,
      label,
      referralCode: data.referral_code,
      guestCount: data.guest_count,
      link,
      qr: await qrSvg(link),
    },
  };
}
