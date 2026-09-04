import type { Strategy } from "@/lib/engine/types";

export type StampVisualStyle = "dots" | "seal" | "ink" | "punch" | "charm";

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
