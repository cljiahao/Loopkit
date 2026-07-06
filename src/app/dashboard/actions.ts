"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { normalizePhone } from "@/lib/phone";
import { rewardReady } from "@/lib/loyalty";
import { createServerClient } from "@/lib/supabase/server";
import type { StampState } from "@/app/dashboard/stamp-state";

export async function stampAction(
  _prev: StampState,
  formData: FormData,
): Promise<StampState> {
  await requireVendor();

  const program = await getProgram();
  if (!program) {
    return { status: "error", message: "Set up your card first." };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Enter a valid Singapore phone number.",
    };
  }

  const supabase = await createServerClient();
  const { data: card, error } = await supabase.rpc("add_stamp", {
    p_program: program.id,
    p_phone: normalized.phone,
  });
  if (error || !card) {
    return { status: "error", message: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard");
  return {
    status: "ok",
    card: { id: card.id, phone: card.phone, stamp_count: card.stamp_count },
    rewardReady: rewardReady(card.stamp_count, program.stamps_required),
  };
}

export async function redeemAction(formData: FormData): Promise<void> {
  await requireVendor();

  const cardId = z.string().min(1).parse(formData.get("card_id"));

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("redeem", { p_card: cardId });
  if (error) throw new Error(`redeemAction: ${error.message}`);

  revalidatePath("/dashboard");
}
