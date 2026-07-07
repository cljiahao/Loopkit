import { describe, it, expect } from "vitest";
import { stampStrategy } from "@/lib/engine/stamp";

const cfg = { stamps_required: 5, reward_text: "free kopi" };
const now = new Date("2026-07-07T00:00:00Z");

describe("stampStrategy", () => {
  it("defaults to an empty card", () => {
    expect(stampStrategy.defaults(cfg)).toEqual({
      stamp_count: 0,
      reward_count: 0,
    });
  });
  it("adds a stamp and caps at the requirement", () => {
    let s = { stamp_count: 4, reward_count: 0 };
    s = stampStrategy.apply({ kind: "visit" }, s, cfg, now).state;
    expect(s.stamp_count).toBe(5);
    const capped = stampStrategy.apply({ kind: "visit" }, s, cfg, now);
    expect(capped.state.stamp_count).toBe(5);
  });
  it("reports rewardReady only at the requirement", () => {
    expect(
      stampStrategy.progress({ stamp_count: 4, reward_count: 0 }, cfg, now)
        .rewardReady,
    ).toBe(false);
    expect(
      stampStrategy.progress({ stamp_count: 5, reward_count: 0 }, cfg, now)
        .rewardReady,
    ).toBe(true);
  });
  it("unlocks the reward on the stamp that reaches the requirement", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 4, reward_count: 0 },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
  });
  it("redeem resets stamps and increments reward_count", () => {
    expect(
      stampStrategy.redeem({ stamp_count: 5, reward_count: 1 }, cfg),
    ).toEqual({ stamp_count: 0, reward_count: 2 });
  });
  it("progress renders a dot view", () => {
    expect(
      stampStrategy.progress({ stamp_count: 3, reward_count: 0 }, cfg, now)
        .view,
    ).toEqual({ kind: "dots", filled: 3, total: 5 });
  });
});
