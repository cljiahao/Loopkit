import { MS_PER_DAY } from "@/lib/utils";
import { classifyActivity } from "@/lib/stats";

export type VendorActivityMetric = { label: string; value: string };

export type VendorActivity = {
  active: boolean;
  plan: "free" | "pro" | null;
  status: null;
  metrics: VendorActivityMetric[];
  lastActivityAt: string | null;
};

type VAProgram = { id: string };
type VACard = { id: string };
type VAEvent = {
  card_id: string;
  kind: string;
  created_at: string;
  payload?: unknown;
};

/**
 * Pure aggregation behind GET /api/merqo/vendor-activity, once the caller
 * has already resolved the vendor's auth-user id (a 404 for an unknown
 * email is the route's job, not this function's — this only ever runs for a
 * vendor that does exist as a user). `isPro`/`programs`/`cards`/`events` are
 * all pre-scoped to this one vendor. `status` is always null — loopkit has
 * no per-vendor health concept yet, only program-level (see
 * docs/business/2026-08-26-cross-kit-vendor-activity-design.md).
 */
export function computeVendorActivity(
  isPro: boolean,
  programs: VAProgram[],
  cards: VACard[],
  events: VAEvent[],
  nowMs: number,
): VendorActivity {
  if (programs.length === 0) {
    return {
      active: false,
      plan: null,
      status: null,
      metrics: [],
      lastActivityAt: null,
    };
  }

  const { activityEvents, rewardEvents } = classifyActivity(events);
  const cutoff30d = nowMs - 30 * MS_PER_DAY;
  const stamps30d = activityEvents.filter(
    (e) => Date.parse(e.created_at) >= cutoff30d,
  ).length;
  const rewards30d = rewardEvents.filter(
    (e) => Date.parse(e.created_at) >= cutoff30d,
  ).length;

  // Most recent event of any real customer-facing kind (stamp/visit/redeem/
  // adjust/win) — 'regen' (card regeneration) is excluded, same carve-out
  // classifyActivity itself uses: it's not a customer action.
  let lastActivityAt: string | null = null;
  for (const e of events) {
    if (e.kind === "regen") continue;
    if (
      !lastActivityAt ||
      Date.parse(e.created_at) > Date.parse(lastActivityAt)
    ) {
      lastActivityAt = e.created_at;
    }
  }

  return {
    active: true,
    plan: isPro ? "pro" : "free",
    status: null,
    metrics: [
      { label: "Programs", value: String(programs.length) },
      { label: "Cards", value: String(cards.length) },
      { label: "Stamps (30d)", value: String(stamps30d) },
      { label: "Rewards redeemed (30d)", value: String(rewards30d) },
    ],
    lastActivityAt,
  };
}
