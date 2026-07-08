import type { Strategy } from "@/lib/engine/types";

export type StreakConfig = {
  period_days: number;
  target_streak: number;
  reward_text: string;
};

export type StreakState = {
  current_streak: number;
  window_start: string | null;
  reward_banked: boolean;
};

const MS_PER_DAY = 86_400_000;

function labelFor(status: "active" | "grace" | "broken" | "none"): string {
  switch (status) {
    case "active":
      return "Streak active — visit again to keep it";
    case "grace":
      return "Streak at risk — visit before the window closes";
    case "broken":
      return "Streak reset — start again";
    default:
      return "Visit to start a streak";
  }
}

export const streakStrategy = {
  defaults(_config: StreakConfig) {
    return { current_streak: 0, window_start: null, reward_banked: false };
  },
  progress(state, config, now) {
    const periodMs = config.period_days * MS_PER_DAY;
    if (state.window_start === null) {
      const status = "none" as const;
      return {
        stage: status,
        label: labelFor(status),
        view: {
          kind: "streak",
          current: 0,
          target: config.target_streak,
          status,
        },
        rewardReady: state.reward_banked,
      };
    }
    const elapsed = now.getTime() - new Date(state.window_start).getTime();
    const status =
      elapsed < periodMs
        ? "active"
        : elapsed < 2 * periodMs
          ? "grace"
          : "broken";
    const current = status === "broken" ? 0 : state.current_streak;
    return {
      stage: status,
      label: labelFor(status),
      view: { kind: "streak", current, target: config.target_streak, status },
      rewardReady: state.reward_banked,
    };
  },
  apply(event, state, config, now) {
    if (event.kind !== "visit") return { state, rewardUnlocked: false };
    const periodMs = config.period_days * MS_PER_DAY;
    let nextStreak: number;
    let windowStart: string;
    if (state.window_start === null) {
      nextStreak = 1;
      windowStart = now.toISOString();
    } else {
      const elapsed = now.getTime() - new Date(state.window_start).getTime();
      if (elapsed < periodMs) {
        nextStreak = state.current_streak;
        windowStart = state.window_start;
      } else if (elapsed < 2 * periodMs) {
        nextStreak = state.current_streak + 1;
        windowStart = now.toISOString();
      } else {
        nextStreak = 1;
        windowStart = now.toISOString();
      }
    }
    const crossed =
      nextStreak >= config.target_streak &&
      state.current_streak < config.target_streak;
    const reward_banked = state.reward_banked || crossed;
    return {
      state: {
        current_streak: nextStreak,
        window_start: windowStart,
        reward_banked,
      },
      rewardUnlocked: crossed,
    };
  },
  redeem(state, _config: StreakConfig) {
    return {
      current_streak: 0,
      window_start: state.window_start,
      reward_banked: false,
    };
  },
} satisfies Strategy<StreakConfig, StreakState>;
