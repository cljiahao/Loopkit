"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import {
  readCustomerProof,
  saveCustomerProof,
  customerTokenSchema,
  vendorIdSchema,
} from "@/lib/customer-proof";
import { normalizePhone } from "@/lib/phone";
import { getProgress } from "@/lib/engine";
import { qrSvg } from "@merqo/ui";
import { isCardExpired } from "@/lib/expiry";
import type { ActionResult } from "@/lib/action-result";
import { completeReferralCredit } from "./referral-credit";
import type { CardStatus, StatusState } from "../types";

type VendorJoinRow = {
  program_id: string;
  name: string;
  type: string;
  config: unknown;
  state: unknown;
  stamp_count: number;
  card_token: string;
  reward_text: string;
  stamps_required: number;
  expiry_days: number | null;
  cycle_started_at: string | null;
  active: boolean;
  replaced_by_name: string | null;
  replaced_by_stamp_count: number | null;
  vendor_avatar_url: string | null;
  active_vouchers: unknown;
};

type ReferralCredit = {
  pending: true;
  referralHostId: string;
  guestPhone: string;
};

function isPendingReferralCredit(value: unknown): value is ReferralCredit {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { pending?: unknown }).pending === true &&
    z
      .string()
      .uuid()
      .safeParse((value as { referralHostId?: unknown }).referralHostId)
      .success &&
    z
      .string()
      .regex(/^\+65[3689]\d{7}$/)
      .safeParse((value as { guestPhone?: unknown }).guestPhone).success
  );
}

// Referral delivery is best effort after the guest enrollment commits.
async function creditReferralHost(credit: ReferralCredit): Promise<void> {
  try {
    await completeReferralCredit(credit.referralHostId, credit.guestPhone);
  } catch {
    console.error("creditReferralHost failed");
  }
}

// Existing customers must prove possession before the database returns credentials.
async function checkStatusActionImpl(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Enter a valid Singapore phone number.",
    };
  }

  const vendorId = String(formData.get("vendor") ?? "");
  if (!vendorIdSchema.safeParse(vendorId).success) {
    return { status: "error", message: "Missing shop." };
  }
  const referralCode = String(formData.get("ref") ?? "").trim();

  if (referralCode.length > 100)
    return { status: "error", message: "Invalid referral link." };
  const submittedProof = String(formData.get("card_code") ?? "").trim();
  if (
    submittedProof &&
    !customerTokenSchema.safeParse(submittedProof).success
  ) {
    return {
      status: "error",
      message:
        "Enter the saved code from your card, or ask the shop to recover it.",
    };
  }
  const proof = submittedProof || (await readCustomerProof(vendorId));
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("customer_join", {
    p_vendor: vendorId,
    p_phone: normalized.phone,
    p_token: proof,
    p_referral_code: referralCode || null,
  });
  if (error)
    return {
      status: "error",
      message: "Use your saved card code or ask the shop to recover your card.",
    };
  const parsedPayload = z
    .object({
      cards: z.array(
        z.object({
          program_id: z.string().uuid(),
          name: z.string(),
          type: z.string(),
          config: z.unknown(),
          state: z.unknown(),
          stamp_count: z.number(),
          card_token: customerTokenSchema,
          reward_text: z.string(),
          stamps_required: z.number(),
          expiry_days: z.number().nullable(),
          cycle_started_at: z.string().nullable(),
          active: z.boolean(),
          replaced_by_name: z.string().nullable(),
          replaced_by_stamp_count: z.number().nullable(),
          vendor_avatar_url: z.string().nullable(),
          active_vouchers: z
            .array(
              z.object({
                id: z.string().uuid(),
                voucher_token: customerTokenSchema,
                reward_text: z.string(),
                expires_at: z.string().nullable(),
              }),
            )
            .optional()
            .default([]),
        }),
      ),
      referral_credit: z.unknown().optional(),
    })
    .safeParse(data);
  if (!parsedPayload.success)
    return { status: "error", message: "Could not read your card. Try again." };
  const payload = parsedPayload.data;
  const rows = payload.cards as VendorJoinRow[];
  if (rows.length === 0) {
    return { status: "none", message: "We couldn't find any rewards here." };
  }

  await saveCustomerProof(vendorId, rows[0]!.card_token);
  const pendingCredit = payload?.referral_credit;
  if (isPendingReferralCredit(pendingCredit)) {
    await creditReferralHost(pendingCredit);
  }

  const cards: CardStatus[] = await Promise.all(
    rows.map(async (row) => {
      const programLike = {
        type: row.type,
        config: row.config,
        stamps_required: row.stamps_required,
        reward_text: row.reward_text,
      };
      const cardLike = {
        state: row.state,
        stamp_count: row.stamp_count ?? 0,
        reward_count: 0,
      };
      const progress = getProgress(programLike, cardLike, new Date());
      const qr = await qrSvg(row.card_token);
      const expired =
        row.cycle_started_at != null &&
        isCardExpired(row.cycle_started_at, row.expiry_days, new Date());

      const rawVouchers = Array.isArray(row.active_vouchers)
        ? (row.active_vouchers as {
            id: string;
            voucher_token: string;
            reward_text: string;
            expires_at: string | null;
          }[])
        : [];
      const activeVouchers = await Promise.all(
        rawVouchers.map(async (v) => ({
          id: v.id,
          rewardText: v.reward_text,
          expiresAt: v.expires_at,
          qr: await qrSvg(v.voucher_token),
        })),
      );

      return {
        programId: row.program_id,
        cardCode: row.card_token,
        name: row.name,
        label: progress.label,
        view: progress.view,
        rewardReady: progress.rewardReady,
        reward_text: row.reward_text,
        qr,
        expired,
        active: row.active,
        replacedByName: row.replaced_by_name ?? null,
        carriedOverCount:
          row.replaced_by_stamp_count && row.replaced_by_stamp_count > 0
            ? row.replaced_by_stamp_count
            : null,
        activeVouchers,
      };
    }),
  );

  return {
    status: "found",
    cards,
    phone: normalized.phone,
    vendorAvatarUrl: rows[0]?.vendor_avatar_url ?? null,
  };
}

// A proved customer may start a fresh cycle only after expiry.
async function regenerateCardActionImpl(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }
  const programId = String(formData.get("program") ?? "");
  if (!z.string().uuid().safeParse(programId).success) {
    return { success: false, error: "Missing program." };
  }

  const supabase = await createServiceClient();
  const vendorId = String(formData.get("vendor") ?? "");
  if (!vendorIdSchema.safeParse(vendorId).success)
    return { success: false, error: "Missing shop." };
  const proof = await readCustomerProof(vendorId);
  if (!proof)
    return {
      success: false,
      error: "Use your saved card code or ask the shop to recover your card.",
    };
  const { data: card, error } = await supabase.rpc(
    "customer_reset_expired_card",
    {
      p_vendor: vendorId,
      p_token: proof,
      p_program: programId,
      p_phone: normalized.phone,
    },
  );
  if (error || !card) {
    return { success: false, error: "Something went wrong." };
  }

  await saveCustomerProof(vendorId, card.card_token);
  return { success: true, phone: normalized.phone };
}

async function setCustomerBirthdayActionImpl(
  formData: FormData,
): Promise<ActionResult> {
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }
  const vendorId = String(formData.get("vendor") ?? "");
  if (!vendorIdSchema.safeParse(vendorId).success) {
    return { success: false, error: "Missing shop." };
  }
  const month = Number(formData.get("month"));
  const day = Number(formData.get("day"));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { success: false, error: "Pick a month." };
  }
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { success: false, error: "Pick a day." };
  }

  const supabase = await createServiceClient();
  const proof = await readCustomerProof(vendorId);
  if (!proof)
    return {
      success: false,
      error: "Use your saved card code or ask the shop to recover your card.",
    };
  const { error } = await supabase.rpc("customer_set_birthday", {
    p_token: proof,
    p_vendor: vendorId,
    p_phone: normalized.phone,
    p_month: month,
    p_day: day,
  });
  if (error) {
    return { success: false, error: "Something went wrong." };
  }

  return { success: true };
}

async function selectPointsRewardActionImpl(
  formData: FormData,
): Promise<
  ActionResult<{ id: string; phone: string; rewardText: string; qr: string }>
> {
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }
  const programId = String(formData.get("program") ?? "");
  if (!z.string().uuid().safeParse(programId).success) {
    return { success: false, error: "Missing program." };
  }
  const itemId = String(formData.get("item_id") ?? "");
  if (!z.string().min(1).max(100).safeParse(itemId).success) {
    return { success: false, error: "Missing reward." };
  }

  const supabase = await createServiceClient();
  const vendorId = String(formData.get("vendor") ?? "");
  if (!vendorIdSchema.safeParse(vendorId).success)
    return { success: false, error: "Missing shop." };
  const proof = await readCustomerProof(vendorId);
  if (!proof)
    return {
      success: false,
      error: "Use your saved card code or ask the shop to recover your card.",
    };
  const { data: voucher, error } = await supabase.rpc(
    "customer_select_points_reward",
    {
      p_vendor: vendorId,
      p_token: proof,
      p_program: programId,
      p_phone: normalized.phone,
      p_item_id: itemId,
    },
  );
  if (error || !voucher) {
    const message =
      error?.message === "insufficient_points"
        ? "Not enough points for that reward yet."
        : "Something went wrong. Try again.";
    return { success: false, error: message };
  }

  const qr = await qrSvg(voucher.voucher_token ?? "");
  return {
    success: true,
    id: voucher.id,
    phone: normalized.phone,
    rewardText: voucher.reward_text,
    qr,
  };
}

export async function checkStatusAction(
  prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  try {
    return await checkStatusActionImpl(prev, formData);
  } catch {
    return { status: "error", message: "Could not read your card. Try again." };
  }
}
export async function regenerateCardAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  try {
    return await regenerateCardActionImpl(formData);
  } catch {
    return { success: false, error: "Could not start a new card. Try again." };
  }
}
export async function setCustomerBirthdayAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    return await setCustomerBirthdayActionImpl(formData);
  } catch {
    return {
      success: false,
      error: "Could not save your birthday. Try again.",
    };
  }
}
export async function selectPointsRewardAction(
  formData: FormData,
): Promise<
  ActionResult<{ id: string; phone: string; rewardText: string; qr: string }>
> {
  try {
    return await selectPointsRewardActionImpl(formData);
  } catch {
    return {
      success: false,
      error: "Could not redeem your reward. Try again.",
    };
  }
}
