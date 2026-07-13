"use server";

import { createServerClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { allowRequest } from "@/lib/rate-limit";

export type EarnState = {
  status: "idle" | "error" | "success";
  message?: string;
  stampCount?: number;
  stampsRequired?: number;
  rewardText?: string;
};

type LookupRow = {
  vendor_id: string;
  program_id: string;
  program_type: string;
  program_config: unknown;
  stamps_required: number;
  reward_text: string;
  already_claimed: boolean;
  card_state: unknown;
  card_stamp_count: number;
  card_reward_count: number;
};

export async function claimEarnAction(
  _prev: EarnState,
  formData: FormData,
): Promise<EarnState> {
  if (!(await allowRequest("earn-claim"))) {
    return {
      status: "error",
      message: "Too many attempts — try again in a minute.",
    };
  }

  const orderId = String(formData.get("order") ?? "");
  if (!orderId) {
    return { status: "error", message: "Missing order." };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Enter a valid Singapore phone number.",
    };
  }

  const name = String(formData.get("name") ?? "").trim() || null;
  const supabase = await createServerClient();

  const { data: rows, error: lookupError } = await supabase.rpc(
    "qkit_earn_lookup",
    { p_order_id: orderId, p_phone: normalized.phone },
  );
  if (lookupError) {
    console.error("qkit_earn_lookup failed", lookupError.message);
    return { status: "error", message: "Something went wrong." };
  }
  const row = (rows as LookupRow[] | null)?.[0];
  if (!row) {
    return { status: "error", message: "This link isn't valid." };
  }

  if (row.already_claimed) {
    return {
      status: "success",
      stampCount: row.card_stamp_count,
      stampsRequired: row.stamps_required,
      rewardText: row.reward_text,
    };
  }

  // MVP scope: only stamp-type programs are supported end-to-end (see this
  // plan's Global Constraints scope note). Task 8 keeps the dashboard picker
  // from ever configuring a non-stamp program, but this guard is what
  // actually enforces it — the dashboard filter alone doesn't stop a
  // qkit_earn_config row from reaching a non-stamp state some other way
  // (e.g. a program's type changing after being configured).
  if (row.program_type !== "stamp") {
    console.error(
      "qkit_earn: program_type is not 'stamp' — MVP does not support this type",
      row.program_type,
    );
    return {
      status: "error",
      message: "This shop's reward isn't available yet.",
    };
  }

  // Cap-respecting increment (mirrors add_stamp's 0002 SQL cap, kept in TS so
  // qkit_earn_commit stays type-agnostic).
  const nextCount = Math.min(row.card_stamp_count + 1, row.stamps_required);

  const { data: card, error: commitError } = await supabase.rpc(
    "qkit_earn_commit",
    {
      p_order_id: orderId,
      p_phone: normalized.phone,
      p_name: name,
      p_stamp_count: nextCount,
      p_state: {},
    },
  );
  if (commitError || !card) {
    console.error("qkit_earn_commit failed", commitError?.message);
    return { status: "error", message: "Something went wrong." };
  }

  const committed = card as { stamp_count: number };
  return {
    status: "success",
    stampCount: committed.stamp_count,
    stampsRequired: row.stamps_required,
    rewardText: row.reward_text,
  };
}
