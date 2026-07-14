import { describe, it, expect } from "vitest";
import { buildPreviewProgress } from "@/app/setup/preview-state";

const base = {
  name: "Coffee card",
  rewardText: "Free kopi",
  stampsRequired: 10,
  visitsToBloom: 6,
  winPercent: 20,
  pityCeiling: 8 as number | undefined,
  periodDays: 7,
  targetStreak: 4,
  segments: [
    { label: "Try again", weight: 5, is_reward: false },
    { label: "Free item", weight: 1, is_reward: true },
  ],
  headStart: false,
};

describe("buildPreviewProgress", () => {
  it("stamp: fresh card shows zero-filled dots", () => {
    const progress = buildPreviewProgress({ ...base, type: "stamp" });
    expect(progress.label).toBe("0/10 stamps");
    expect(progress.view).toEqual({ kind: "dots", filled: 0, total: 10 });
  });

  it("stamp: head start seeds ~20% of stamps_required, capped below the requirement", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "stamp",
      headStart: true,
    });
    expect(progress.label).toBe("2/10 stamps");
    expect(progress.view).toEqual({ kind: "dots", filled: 2, total: 10 });
  });

  it("plant: fresh card starts at Seed", () => {
    const progress = buildPreviewProgress({ ...base, type: "plant" });
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 0,
      stageName: "Seed",
      totalStages: 5,
      wilting: false,
    });
  });

  it("plant: head start floors growth at the Sprout stage", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "plant",
      headStart: true,
    });
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 1,
      stageName: "Sprout",
      totalStages: 5,
      wilting: false,
    });
  });

  it("streak: fresh card has no active window", () => {
    const progress = buildPreviewProgress({ ...base, type: "streak" });
    expect(progress.view).toEqual({
      kind: "streak",
      current: 0,
      target: 4,
      status: "none",
    });
  });

  it("streak: head start banks one full period", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "streak",
      headStart: true,
    });
    expect(progress.view).toEqual({
      kind: "streak",
      current: 1,
      target: 4,
      status: "active",
    });
  });

  it("lucky: always previews at the zero/unplayed state, ignoring head start", () => {
    const fresh = buildPreviewProgress({ ...base, type: "lucky" });
    const withHeadStart = buildPreviewProgress({
      ...base,
      type: "lucky",
      headStart: true,
    });
    expect(fresh.view).toEqual({ kind: "dots", filled: 0, total: 8 });
    expect(withHeadStart.view).toEqual(fresh.view);
  });

  it("wheel: renders the configured segments at the zero/unplayed state", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "wheel",
      pityCeiling: undefined,
    });
    expect(progress.view.kind).toBe("chance");
    if (progress.view.kind !== "chance") {
      throw new Error("expected a chance view");
    }
    expect(progress.view.variant).toBe("wheel");
    expect(progress.view.landedId).toBeNull();
    expect(
      progress.view.segments.map((s) => ({ label: s.label, reward: s.reward })),
    ).toEqual([
      { label: "Try again", reward: false },
      { label: "Free item", reward: true },
    ]);
  });
});
