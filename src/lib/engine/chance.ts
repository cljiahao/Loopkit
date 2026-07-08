import type { Strategy } from "@/lib/engine/types";

export type ChanceSegment = {
  id: string;
  label: string;
  weight: number;
  reward_text?: string;
};
export type ChanceConfig = {
  variant: "wheel" | "scratch";
  segments: ChanceSegment[];
  pity_ceiling?: number;
  cooldown_visits: number;
  reward_text: string;
};
export type ChanceState = {
  visits_since_win: number;
  total_wins: number;
  landed_segment_id: string | null;
};

export function pickSegment(
  segments: ChanceSegment[],
  roll: number,
  forceReward: boolean,
): ChanceSegment {
  const rewardSegments = segments.filter((s) => s.reward_text);
  const pool = forceReward
    ? rewardSegments.length > 0
      ? rewardSegments
      : segments
    : segments;
  const total = pool.reduce((sum, s) => sum + s.weight, 0);
  let acc = 0;
  for (const segment of pool) {
    acc += segment.weight / total;
    if (roll < acc) return segment;
  }
  return pool[pool.length - 1];
}

export function makeChanceStrategy(
  variant: "wheel" | "scratch",
): Strategy<ChanceConfig, ChanceState> {
  return {
    defaults() {
      return { visits_since_win: 0, total_wins: 0, landed_segment_id: null };
    },
    progress(state, config) {
      return {
        stage: "play",
        label: variant === "wheel" ? "Spin to play" : "Scratch to reveal",
        view: {
          kind: "chance",
          variant,
          segments: config.segments.map((s) => ({
            id: s.id,
            label: s.label,
            reward: !!s.reward_text,
          })),
          landedId: state.landed_segment_id,
        },
        rewardReady: false,
      };
    },
    apply(event, state, config) {
      if (event.kind !== "visit") return { state, rewardUnlocked: false };
      const roll =
        typeof event.payload?.roll === "number" ? event.payload.roll : 1;
      const eligible = state.visits_since_win >= config.cooldown_visits;
      const forcePity =
        config.pity_ceiling != null &&
        eligible &&
        state.visits_since_win + 1 >= config.pity_ceiling;
      const pool = eligible
        ? config.segments
        : config.segments.filter((s) => !s.reward_text);
      const segment = pickSegment(
        pool.length > 0 ? pool : config.segments,
        roll,
        forcePity,
      );
      const won = eligible && !!segment.reward_text;
      return {
        state: {
          visits_since_win: won ? 0 : state.visits_since_win + 1,
          total_wins: won ? state.total_wins + 1 : state.total_wins,
          landed_segment_id: segment.id,
        },
        rewardUnlocked: won,
      };
    },
    redeem(state) {
      return state;
    },
  };
}

export const wheelStrategy = makeChanceStrategy("wheel");
export const scratchStrategy = makeChanceStrategy("scratch");
