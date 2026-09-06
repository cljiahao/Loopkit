import type { Strategy } from "@/lib/engine/types";

export type StampVisualStyle = "dots" | "seal" | "ink" | "punch" | "charm";

export type PointsRedemptionMode = "catalog" | "offset";
export type PointsCatalogItem = { id: string; label: string; cost: number };
export type PointsOffsetRate = { points: number; dollars: number };

export type StampConfig = {
  stamps_required: number;
  reward_text: string;
  variant?: "dots" | "flame" | "points";
  points_per_visit?: number;
  stamp_mark?: {
    mode: "dot" | "preset" | "photo";
    preset?: "gift" | "coffee" | "star" | "heart";
  };
  // Plain-dots-only, vendor-picked skin for each stamp — ignored for
  // flame/points variants (they don't render StampDots at all).
  stamp_style?: StampVisualStyle;
  stamp_color?: string;
  // Points-only. No redemption_mode means the plain single-threshold
  // behavior below still applies — every new Points Club program picks
  // one, but nothing else in this config shape changes for it.
  redemption_mode?: PointsRedemptionMode;
  catalog?: PointsCatalogItem[];
  offset_rate?: PointsOffsetRate;
};
export type StampState = { stamp_count: number; reward_count: number };

const FLAME_STAGE_NAMES = [
  "Ember",
  "Spark",
  "Small Fire",
  "Medium Fire",
  "Full Campfire",
] as const;

// Mirrors Plant's stageIndexFor (src/lib/engine/plant.ts) — 5 even buckets
// at 0/20/40/60/80% of `total`; the highest threshold met wins.
// Dedupe collided thresholds so stages are reachable only once threshold strictly increases.
// Guarantee stage 4 at 100% completion regardless of threshold collisions.
function flameStageFor(filled: number, total: number): number {
  if (filled >= total) return FLAME_STAGE_NAMES.length - 1;
  let idx = 0;
  let lastThreshold = -1;
  for (let i = 0; i < FLAME_STAGE_NAMES.length; i++) {
    const threshold = Math.round((total * i) / FLAME_STAGE_NAMES.length);
    if (threshold <= lastThreshold) continue;
    if (filled >= threshold) idx = i;
    lastThreshold = threshold;
  }
  return idx;
}

function pointsRewardReady(config: StampConfig, balance: number): boolean {
  if (config.redemption_mode === "offset") return balance > 0;
  const cheapest = (config.catalog ?? []).reduce(
    (min, item) => Math.min(min, item.cost),
    Infinity,
  );
  return balance >= cheapest;
}

function pointsOffsetValue(
  config: StampConfig,
  balance: number,
): number | undefined {
  if (config.redemption_mode !== "offset" || !config.offset_rate) {
    return undefined;
  }
  const { points, dollars } = config.offset_rate;
  return Math.round(((balance * dollars) / points) * 100) / 100;
}

export const stampStrategy: Strategy<StampConfig, StampState> = {
  defaults() {
    return { stamp_count: 0, reward_count: 0 };
  },
  progress(state, config) {
    const filled = Math.min(state.stamp_count, config.stamps_required);
    const total = config.stamps_required;
    const rewardReady = state.stamp_count >= total;
    if (config.variant === "flame") {
      const stage = flameStageFor(filled, total);
      const stageName = FLAME_STAGE_NAMES[stage];
      return {
        stage: rewardReady ? "ready" : "collecting",
        label: `${stageName} — ${filled}/${total}`,
        view: {
          kind: "flame",
          filled,
          total,
          stage,
          stageName,
          totalStages: FLAME_STAGE_NAMES.length,
        },
        rewardReady,
      };
    }
    const isPoints = config.variant === "points";
    if (isPoints && config.redemption_mode) {
      const balance = state.stamp_count;
      const shopReady = pointsRewardReady(config, balance);
      return {
        stage: shopReady ? "ready" : "collecting",
        label: `${balance.toLocaleString()} points`,
        view: {
          kind: "dots",
          filled,
          total,
          variant: "points",
          redemptionMode: config.redemption_mode,
          catalog: config.catalog?.map((item) => ({
            ...item,
            affordable: balance >= item.cost,
          })),
          offsetRate: config.offset_rate,
          offsetValue: pointsOffsetValue(config, balance),
        },
        rewardReady: shopReady,
      };
    }
    const unitLabel = isPoints ? "points" : "stamps";
    return {
      stage: rewardReady ? "ready" : "collecting",
      label: `${filled}/${total} ${unitLabel}`,
      view: {
        kind: "dots",
        filled,
        total,
        variant: isPoints ? "points" : "dots",
        markMode: config.stamp_mark?.mode,
        markPreset: config.stamp_mark?.preset,
        style: !isPoints ? config.stamp_style : undefined,
        color: !isPoints ? config.stamp_color : undefined,
        redemptionMode: undefined,
        catalog: undefined,
        offsetRate: undefined,
        offsetValue: undefined,
      },
      rewardReady,
    };
  },
  apply(event, state, config) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const inc = config.points_per_visit ?? 1;
    const next = Math.min(state.stamp_count + inc, config.stamps_required);
    return {
      state: { ...state, stamp_count: next },
      rewardUnlocked:
        state.stamp_count < config.stamps_required &&
        next >= config.stamps_required,
    };
  },
  redeem(state) {
    return { stamp_count: 0, reward_count: state.reward_count + 1 };
  },
};
