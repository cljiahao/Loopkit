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
    ).toEqual({ kind: "dots", filled: 3, total: 5, variant: "dots" });
  });
});

describe("stampStrategy flame variant", () => {
  const flameCfg = {
    stamps_required: 10,
    reward_text: "free kopi",
    variant: "flame" as const,
  };

  it("stage 0 (Ember) at 0%", () => {
    const p = stampStrategy.progress(
      { stamp_count: 0, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "flame",
      filled: 0,
      total: 10,
      stage: 0,
      stageName: "Ember",
      totalStages: 5,
    });
  });

  it("stage 1 (Spark) at exactly the 20% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toMatchObject({ stage: 1, stageName: "Spark" });
  });

  it("stage 2 (Small Fire) at exactly the 40% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 4, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toMatchObject({ stage: 2, stageName: "Small Fire" });
  });

  it("stage 3 (Medium Fire) at exactly the 60% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 6, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toMatchObject({ stage: 3, stageName: "Medium Fire" });
  });

  it("stage 4 (Full Campfire) at exactly the 80% threshold and at 100%", () => {
    const at80 = stampStrategy.progress(
      { stamp_count: 8, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(at80.view).toMatchObject({ stage: 4, stageName: "Full Campfire" });

    const at100 = stampStrategy.progress(
      { stamp_count: 10, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(at100.view).toMatchObject({ stage: 4, stageName: "Full Campfire" });
  });

  it("rounds thresholds sensibly for an odd stamps_required", () => {
    const oddCfg = { ...flameCfg, stamps_required: 7 };
    // round(7*0.4) = 3 -- below it is still stage 1, at it is stage 2.
    const below = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      oddCfg,
      now,
    );
    expect(below.view).toMatchObject({ stage: 1 });
    const at = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      oddCfg,
      now,
    );
    expect(at.view).toMatchObject({ stage: 2 });
  });

  it("still starts at Ember (stage 0) at filled=0 and never skips backward, even at the schema-enforced minimum stamps_required (2)", () => {
    const tinyCfg = { ...flameCfg, stamps_required: 2 };
    const at0 = stampStrategy.progress(
      { stamp_count: 0, reward_count: 0 },
      tinyCfg,
      now,
    );
    expect(at0.view).toMatchObject({ stage: 0, stageName: "Ember" });
    const at1 = stampStrategy.progress(
      { stamp_count: 1, reward_count: 0 },
      tinyCfg,
      now,
    );
    expect((at1.view as { stage: number }).stage).toBeGreaterThan(0);
    const at2 = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      tinyCfg,
      now,
    );
    expect(at2.view).toMatchObject({ stage: 4, stageName: "Full Campfire" });
  });

  it("still reaches Full Campfire (stage 4) at 100% completion even when stamps_required=3 (a threshold-collision case)", () => {
    const smallCfg = { ...flameCfg, stamps_required: 3 };
    const complete = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      smallCfg,
      now,
    );
    expect(complete.view).toMatchObject({
      stage: 4,
      stageName: "Full Campfire",
    });
  });

  it("dots variant (default, no variant field) is unaffected", () => {
    const p = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      cfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 3,
      total: 5,
      variant: "dots",
    });
  });
});

describe("stampStrategy points variant", () => {
  const pointsCfg = {
    stamps_required: 100,
    reward_text: "free kopi",
    variant: "points" as const,
    points_per_visit: 10,
  };

  it("apply() increments by points_per_visit instead of 1", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 40, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(r.state.stamp_count).toBe(50);
  });

  it("apply() caps at stamps_required even when points_per_visit overshoots", () => {
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 95, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(r.state.stamp_count).toBe(100);
    expect(r.rewardUnlocked).toBe(true);
  });

  it("apply() defaults to +1 when points_per_visit is absent, even with variant points", () => {
    const cfgNoAmount = {
      stamps_required: 100,
      reward_text: "free kopi",
      variant: "points" as const,
    };
    const r = stampStrategy.apply(
      { kind: "visit" },
      { stamp_count: 40, reward_count: 0 },
      cfgNoAmount,
      now,
    );
    expect(r.state.stamp_count).toBe(41);
  });

  it("progress() tags the dots view with variant: points and uses a points-worded label", () => {
    const p = stampStrategy.progress(
      { stamp_count: 40, reward_count: 0 },
      pointsCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 40,
      total: 100,
      variant: "points",
    });
    expect(p.label).toBe("40/100 points");
  });

  it("redeem() is unaffected by points_per_visit — still resets to 0 and increments reward_count", () => {
    expect(
      stampStrategy.redeem({ stamp_count: 100, reward_count: 1 }, pointsCfg),
    ).toEqual({ stamp_count: 0, reward_count: 2 });
  });
});

describe("stampStrategy stamp_mark passthrough", () => {
  it("carries mode/preset from config into the dots view", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      {
        stamps_required: 5,
        reward_text: "free kopi",
        stamp_mark: { mode: "preset", preset: "coffee" },
      },
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 2,
      total: 5,
      variant: "dots",
      markMode: "preset",
      markPreset: "coffee",
    });
  });

  it("leaves markMode/markPreset undefined when stamp_mark is absent", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      cfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 2,
      total: 5,
      variant: "dots",
      markMode: undefined,
      markPreset: undefined,
    });
  });
});

describe("stampStrategy stamp_style/stamp_color passthrough", () => {
  it("carries style/color from config into the dots view", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      {
        stamps_required: 5,
        reward_text: "free kopi",
        stamp_style: "seal",
        stamp_color: "#8a2436",
      },
      now,
    );
    expect(p.view).toMatchObject({ style: "seal", color: "#8a2436" });
  });

  it("leaves style/color undefined when absent from config", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      cfg,
      now,
    );
    expect(p.view).toMatchObject({ style: undefined, color: undefined });
  });

  it("drops style/color for the points variant, which never renders StampDots", () => {
    const p = stampStrategy.progress(
      { stamp_count: 40, reward_count: 0 },
      {
        stamps_required: 100,
        reward_text: "free kopi",
        variant: "points" as const,
        stamp_style: "seal",
        stamp_color: "#8a2436",
      },
      now,
    );
    expect(p.view).toMatchObject({ style: undefined, color: undefined });
  });
});
