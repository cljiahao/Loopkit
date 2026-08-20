"use server";

import { createServerClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/phone";
import { applyVisit, getProgress } from "@/lib/engine";
import { qrSvg } from "@/lib/qr";
import { isCardExpired } from "@/lib/expiry";
import type { ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/types";
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
  // Only ever set by vendor_join_referred, not plain vendor_join — see
  // ReferralCredit below.
  referral_credit?: unknown;
};

// Mirrors the jsonb blob loopkit.vendor_join_referred builds
// (supabase/migrations/0040) when a referral link resolves to a non-stamp
// program: it can't compute the next engine state itself (that's this
// module's job, via applyVisit), so it reserves the credit and hands back
// everything needed to finish it.
type ReferralCredit = {
  pending: true;
  referralHostId: string;
  guestPhone: string;
  programId: string;
  programType: string;
  programConfig: unknown;
  stampsRequired: number;
  rewardText: string;
  hostPhone: string;
  state: unknown;
  stampCount: number;
  rewardCount: number;
};

function isPendingReferralCredit(value: unknown): value is ReferralCredit {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { pending?: unknown }).pending === true
  );
}

// Finishes a non-stamp-type referral credit vendor_join_referred reserved:
// computes the next state with the same TypeScript engine
// src/app/dashboard/actions.ts's recordVisitAction uses for a
// vendor-triggered visit, then persists it via apply_referral_credit
// (loopkit.record_visit's shape, minus the vendor-session gate that path
// doesn't have here). Never allowed to affect checkStatusAction's own
// result — the guest's own join already succeeded by the time this runs,
// so a failure here is logged and swallowed, same as this app's other
// fire-and-forget side effects (e.g. redeemAction's Telegram alerts).
async function creditReferralHost(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  credit: ReferralCredit,
): Promise<void> {
  try {
    const programLike = {
      type: credit.programType,
      config: credit.programConfig,
      stamps_required: credit.stampsRequired,
      reward_text: credit.rewardText,
    };
    const cardLike = {
      state: credit.state,
      stamp_count: credit.stampCount,
      reward_count: credit.rewardCount,
    };
    const event = { kind: "visit" as const, payload: { roll: Math.random() } };
    const { state, rewardUnlocked } = applyVisit(
      programLike,
      cardLike,
      event,
      new Date(),
    );

    const { error } = await supabase.rpc("apply_referral_credit", {
      p_referral_host_id: credit.referralHostId,
      p_guest_phone: credit.guestPhone,
      p_state: state as Json,
      p_kind: "visit",
      p_payload: { won: rewardUnlocked, roll: event.payload.roll },
    });
    if (error) {
      console.error("apply_referral_credit failed", error.message);
    }
  } catch (err) {
    console.error("creditReferralHost failed", err);
  }
}

// Public card-check action — no auth. The vendor shares /c?v=<vendorId> (or
// a per-host /c?v=<vendorId>&ref=<code> referral link — see
// src/app/dashboard/referrals/); the phone the customer types in is the
// only other input. vendor_join / vendor_join_referred (both SECURITY
// DEFINER) are the sole read/write path: they enroll the phone into every
// active program it doesn't already have a card for, then return every
// card the phone holds at this vendor. The engine computes progress per
// card, so this stays type-agnostic across program types. A `ref` present
// but not resolving to a real referral_hosts row (unknown code, or one
// minted by a different vendor) is not an error — it behaves exactly like
// the plain vendor_join path, per loopkit.vendor_join_referred's own
// cross-vendor isolation guarantee.
export async function checkStatusAction(
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
  if (!vendorId) {
    return { status: "error", message: "Missing shop." };
  }
  const referralCode = String(formData.get("ref") ?? "").trim();

  const supabase = await createServerClient();

  const { data, error } = referralCode
    ? await supabase.rpc("vendor_join_referred", {
        p_vendor: vendorId,
        p_phone: normalized.phone,
        p_referral_code: referralCode,
      })
    : await supabase.rpc("vendor_join", {
        p_vendor: vendorId,
        p_phone: normalized.phone,
      });
  if (error) {
    console.error("vendor_join failed", error);
    return { status: "error", message: "Something went wrong." };
  }

  const rows = (data ?? []) as VendorJoinRow[];
  if (rows.length === 0) {
    return { status: "none", message: "We couldn't find any rewards here." };
  }

  const pendingCredit = rows[0]?.referral_credit;
  if (isPendingReferralCredit(pendingCredit)) {
    await creditReferralHost(supabase, pendingCredit);
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

      return {
        programId: row.program_id,
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

// Customer self-service card regeneration — for a lost QR or an expired card.
// Same trust model as enroll_card/checkStatusAction: identity is the phone
// number typed into /c, no separate customer auth exists in this app.
// Unchanged by the vendor-level join redesign — still acts on one program's
// card at a time, invoked per-card from the check-form's card list.
export async function regenerateCardAction(
  formData: FormData,
): Promise<ActionResult<{ phone: string }>> {
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }
  const programId = String(formData.get("program") ?? "");
  if (!programId) {
    return { success: false, error: "Missing program." };
  }

  const supabase = await createServerClient();
  const { data: card, error } = await supabase.rpc("regenerate_card", {
    p_program: programId,
    p_phone: normalized.phone,
  });
  if (error || !card) {
    console.error("regenerate_card failed", error);
    return { success: false, error: "Something went wrong." };
  }

  return { success: true, phone: normalized.phone };
}
