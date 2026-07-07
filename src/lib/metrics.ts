import { MS_PER_DAY } from "@/lib/utils";

// Mirrors merqo's `metricsPayloadSchema` (../merqo/src/lib/metrics-schema.ts).
// Defined locally rather than imported — cross-repo runtime imports aren't
// available; the contract test (test/contract/merqo-metrics.contract.test.ts)
// keeps this in lockstep with merqo's actual schema.
export type MetricsPayload = {
  product: string;
  generated_at: string;
  revenue_cents_30d: number;
  revenue_cents_all: number;
  gmv_cents_30d: number;
  active_vendors: number;
  orders_7d: number;
  orders_prev_7d: number;
  signups_7d: number;
  pro_vendors: number;
  total_vendors: number;
  pending_upgrade_requests: number;
  funnel: {
    signed_up: number;
    with_booth: number;
    with_order: number;
    pro: number;
  };
};

// `computeLoopkitMetrics` is pure — it has no notion of "now" as an ISO string
// or of the product name, so it returns everything except `product`/
// `generated_at`; the route attaches those. Also carries loopkit-only extras
// (harmless to merqo's `z.object` parse, which strips unknown keys).
export type LoopkitMetrics = Omit<
  MetricsPayload,
  "product" | "generated_at"
> & {
  cards_total: number;
  rewards_redeemed: number;
};

export type LoopkitMetricsInput = {
  nowMs: number;
  programs: { id: string; active: boolean; created_at: string }[];
  cards: { id: string; program_id: string }[];
  stampEvents: { card_id: string; kind: string; created_at: string }[];
};

// loopkit has no revenue/orders/booths — this maps its stamp-card domain onto
// merqo's qkit-shaped payload so /team renders unchanged:
//   total/active_vendors  → programs / active programs
//   orders_7d/prev_7d     → 'stamp' events ("loopkit's activity")
//   with_booth            → programs with ≥1 card
//   with_order            → programs with ≥1 stamp event
//   revenue/gmv/pro/pending → 0 (no revenue tracking, no plans in v1)
export function computeLoopkitMetrics(
  input: LoopkitMetricsInput,
): LoopkitMetrics {
  const { nowMs, programs, cards, stampEvents } = input;
  const cutoff7d = nowMs - 7 * MS_PER_DAY;
  const cutoff14d = nowMs - 14 * MS_PER_DAY;

  const programIdByCardId = new Map(cards.map((c) => [c.id, c.program_id]));

  const signups_7d = programs.filter(
    (p) => Date.parse(p.created_at) >= cutoff7d,
  ).length;

  const stamps = stampEvents.filter((e) => e.kind === "stamp");
  const orders_7d = stamps.filter(
    (e) => Date.parse(e.created_at) >= cutoff7d,
  ).length;
  const orders_prev_7d = stamps.filter((e) => {
    const t = Date.parse(e.created_at);
    return t >= cutoff14d && t < cutoff7d;
  }).length;

  const programIdsWithCards = new Set(cards.map((c) => c.program_id));
  const programIdsWithEvents = new Set(
    stampEvents
      .map((e) => programIdByCardId.get(e.card_id))
      .filter((id): id is string => id !== undefined),
  );

  return {
    revenue_cents_30d: 0,
    revenue_cents_all: 0,
    gmv_cents_30d: 0,
    active_vendors: programs.filter((p) => p.active).length,
    orders_7d,
    orders_prev_7d,
    signups_7d,
    pro_vendors: 0,
    total_vendors: programs.length,
    pending_upgrade_requests: 0,
    funnel: {
      signed_up: programs.length,
      with_booth: programs.filter((p) => programIdsWithCards.has(p.id)).length,
      with_order: programs.filter((p) => programIdsWithEvents.has(p.id)).length,
      pro: 0,
    },
    cards_total: cards.length,
    rewards_redeemed: stampEvents.filter((e) => e.kind === "redeem").length,
  };
}
