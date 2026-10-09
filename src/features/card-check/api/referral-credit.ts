import { randomInt } from "node:crypto";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { applyVisit } from "@/lib/engine";
import type { Json } from "@/lib/types";

const snapshotSchema = z.object({
  program: z.object({
    type: z.enum(["lucky", "plant", "wheel", "scratch"]),
    config: z.unknown().refine((value) => value !== undefined),
    stamps_required: z.number(),
    reward_text: z.string(),
  }),
  card: z.object({
    state: z.record(z.string(), z.unknown()),
    stamp_count: z.number(),
    reward_count: z.number(),
    updated_at: z.string(),
  }),
});

export async function completeReferralCredit(
  referralHostId: string,
  guestPhone: string,
): Promise<void> {
  const service = await createServiceClient();
  const event = {
    kind: "visit" as const,
    payload: { roll: randomInt(2 ** 32) / 2 ** 32 },
  };
  const now = new Date();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await service.rpc("referral_credit_snapshot", {
      p_referral_host_id: referralHostId,
      p_guest_phone: guestPhone,
    });
    if (error) throw new Error(error.message);
    if (data === null) return;
    const current = snapshotSchema.parse(data);
    const { state, rewardUnlocked } = applyVisit(
      current.program,
      current.card,
      event,
      now,
    );
    const result = await service.rpc("apply_referral_credit_checked", {
      p_referral_host_id: referralHostId,
      p_guest_phone: guestPhone,
      p_expected: current as Json,
      p_state: state as Json,
      p_payload: { won: rewardUnlocked, roll: event.payload.roll },
    });
    if (result.error) throw new Error(result.error.message);
    if (result.data === true) return;
    if (result.data !== false)
      throw new Error("Invalid referral commit response");
  }
  throw new Error("Referral state changed; retry on the next referral join");
}
