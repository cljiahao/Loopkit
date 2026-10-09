import { describe, expect, it } from "vitest";
import { luckyStrategy } from "./lucky";
const config = {
  win_probability: 0.25,
  pity_ceiling: 5,
  cooldown_visits: 1,
  reward_text: "Coffee",
};
describe("lucky lifecycle", () => {
  it("initializes a fresh customer and describes progress", () => {
    const state = luckyStrategy.defaults(config);
    expect(state).toEqual({ visits_since_win: 0, total_wins: 0 });
    expect(luckyStrategy.progress(state, config, new Date())).toMatchObject({
      rewardReady: false,
      view: { visitsSinceWin: 0, pityCeiling: 5 },
    });
    expect(luckyStrategy.redeem(state, config)).toEqual(state);
  });
  it("honors cooldown even with a winning roll, and guarantees the pity visit", () => {
    expect(
      luckyStrategy.apply(
        { kind: "visit", payload: { roll: 0 } },
        { visits_since_win: 0, total_wins: 2 },
        config,
        new Date(),
      ),
    ).toEqual({
      state: { visits_since_win: 1, total_wins: 2 },
      rewardUnlocked: false,
    });
    expect(
      luckyStrategy.apply(
        { kind: "visit" },
        { visits_since_win: 4, total_wins: 2 },
        config,
        new Date(),
      ),
    ).toEqual({
      state: { visits_since_win: 0, total_wins: 3 },
      rewardUnlocked: true,
    });
  });
});
