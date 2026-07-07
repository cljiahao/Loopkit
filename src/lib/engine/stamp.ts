import type { Strategy } from "@/lib/engine/types";

export type StampConfig = { stamps_required: number; reward_text: string };
export type StampState = { stamp_count: number; reward_count: number };

export const stampStrategy: Strategy<StampConfig, StampState> = {
  defaults() {
    return { stamp_count: 0, reward_count: 0 };
  },
  progress(state, config) {
    const filled = Math.min(state.stamp_count, config.stamps_required);
    return {
      stage: filled >= config.stamps_required ? "ready" : "collecting",
      label: `${filled}/${config.stamps_required} stamps`,
      view: { kind: "dots", filled, total: config.stamps_required },
      rewardReady: state.stamp_count >= config.stamps_required,
    };
  },
  apply(event, state, config) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const next = Math.min(state.stamp_count + 1, config.stamps_required);
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
