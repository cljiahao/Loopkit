import { describe, it, expect } from "vitest";
import { streakStrategy, type StreakConfig } from "@/lib/engine/streak";

const cfg: StreakConfig = {
  period_days: 7,
  target_streak: 3,
  reward_text: "free item",
};
const day0 = new Date("2026-07-01T00:00:00Z");

describe("streakStrategy", () => {
  it("first visit opens a window at streak 1", () => {
    const r = streakStrategy.apply(
      { kind: "visit" },
      { current_streak: 0, window_start: null, reward_banked: false },
      cfg,
      day0,
    );
    expect(r.state).toEqual({
      current_streak: 1,
      window_start: day0.toISOString(),
      reward_banked: false,
    });
    expect(r.rewardUnlocked).toBe(false);
  });

  it("a second visit within the same window does not increment", () => {
    const midWindow = new Date("2026-07-04T00:00:00Z");
    const r = streakStrategy.apply(
      { kind: "visit" },
      {
        current_streak: 1,
        window_start: day0.toISOString(),
        reward_banked: false,
      },
      cfg,
      midWindow,
    );
    expect(r.state.current_streak).toBe(1);
  });

  it("a visit in the next window increments the streak", () => {
    const nextWindow = new Date("2026-07-08T00:00:00Z"); // day0 + 7d
    const r = streakStrategy.apply(
      { kind: "visit" },
      {
        current_streak: 1,
        window_start: day0.toISOString(),
        reward_banked: false,
      },
      cfg,
      nextWindow,
    );
    expect(r.state.current_streak).toBe(2);
    expect(r.state.window_start).toBe(nextWindow.toISOString());
  });

  it("banks the reward on crossing the target and keeps it banked", () => {
    const nextWindow = new Date("2026-07-08T00:00:00Z");
    const r = streakStrategy.apply(
      { kind: "visit" },
      {
        current_streak: 2,
        window_start: day0.toISOString(),
        reward_banked: false,
      },
      cfg,
      nextWindow,
    );
    expect(r.state.current_streak).toBe(3);
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state.reward_banked).toBe(true);
    const p = streakStrategy.progress(r.state, cfg, nextWindow);
    expect(p.rewardReady).toBe(true);
  });

  it("skipping more than one full window resets the streak to 1", () => {
    const farFuture = new Date("2026-07-20T00:00:00Z"); // day0 + 19d, > 2 periods
    const r = streakStrategy.apply(
      { kind: "visit" },
      {
        current_streak: 2,
        window_start: day0.toISOString(),
        reward_banked: false,
      },
      cfg,
      farFuture,
    );
    expect(r.state.current_streak).toBe(1);
    expect(r.state.window_start).toBe(farFuture.toISOString());
  });

  it("progress reports 'active' inside the window, 'grace' one window late, 'broken' beyond that", () => {
    const state = {
      current_streak: 2,
      window_start: day0.toISOString(),
      reward_banked: false,
    };
    expect(
      streakStrategy.progress(state, cfg, new Date("2026-07-04T00:00:00Z")).view
        .status,
    ).toBe("active");
    expect(
      streakStrategy.progress(state, cfg, new Date("2026-07-10T00:00:00Z")).view
        .status,
    ).toBe("grace");
    expect(
      streakStrategy.progress(state, cfg, new Date("2026-07-20T00:00:00Z")).view
        .status,
    ).toBe("broken");
  });

  it("redeem clears the banked reward and resets the streak", () => {
    const s = streakStrategy.redeem(
      {
        current_streak: 3,
        window_start: day0.toISOString(),
        reward_banked: true,
      },
      cfg,
    );
    expect(s.current_streak).toBe(0);
    expect(s.reward_banked).toBe(false);
  });
});
