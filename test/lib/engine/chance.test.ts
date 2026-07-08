import { describe, it, expect } from "vitest";
import {
  pickSegment,
  makeChanceStrategy,
  type ChanceConfig,
} from "@/lib/engine/chance";

describe("pickSegment", () => {
  const segs = [
    { id: "a", label: "Try again", weight: 6 },
    { id: "b", label: "10% off", weight: 3, reward_text: "10% off" },
    { id: "c", label: "Free drink", weight: 1, reward_text: "a free drink" },
  ];
  it("picks by cumulative weight (deterministic on roll)", () => {
    expect(pickSegment(segs, 0.0, false).id).toBe("a");
    expect(pickSegment(segs, 0.65, false).id).toBe("b");
    expect(pickSegment(segs, 0.95, false).id).toBe("c");
    expect(pickSegment(segs, 0.999, false).id).toBe("c");
  });
  it("restricts to reward segments when forced", () => {
    const picked = pickSegment(segs, 0.0, true);
    expect(picked.reward_text).toBeDefined();
  });
  it("falls back to the full pool if no segment has a reward", () => {
    const noReward = [{ id: "x", label: "Try again", weight: 1 }];
    expect(pickSegment(noReward, 0.5, true).id).toBe("x");
  });
});

describe("chanceStrategy (wheel)", () => {
  const cfg: ChanceConfig = {
    variant: "wheel",
    segments: [
      { id: "a", label: "Try again", weight: 5 },
      { id: "b", label: "Free item", weight: 1, reward_text: "a free item" },
    ],
    pity_ceiling: 5,
    cooldown_visits: 0,
    reward_text: "a free item",
  };
  const now = new Date("2026-07-08T00:00:00Z");
  const strategy = makeChanceStrategy("wheel");

  it("defaults to no spins yet", () => {
    expect(strategy.defaults(cfg)).toEqual({
      visits_since_win: 0,
      total_wins: 0,
      landed_segment_id: null,
    });
  });
  it("lands + wins on a low roll matching the reward segment's slice", () => {
    const r = strategy.apply(
      { kind: "visit", payload: { roll: 0.99 } },
      { visits_since_win: 0, total_wins: 0, landed_segment_id: null },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
    expect(r.state.landed_segment_id).toBe("b");
  });
  it("forces a reward segment at the pity ceiling regardless of roll", () => {
    const r = strategy.apply(
      { kind: "visit", payload: { roll: 0.0 } },
      { visits_since_win: 4, total_wins: 0, landed_segment_id: null },
      cfg,
      now,
    );
    expect(r.rewardUnlocked).toBe(true);
  });
  it("progress exposes the segment list + last landed id", () => {
    const p = strategy.progress(
      { visits_since_win: 1, total_wins: 1, landed_segment_id: "b" },
      cfg,
      now,
    );
    expect(p.view).toMatchObject({
      kind: "chance",
      variant: "wheel",
      landedId: "b",
    });
    if (p.view.kind !== "chance") throw new Error("expected chance view");
    expect(p.view.segments).toHaveLength(2);
  });
});
