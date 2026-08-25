import { describe, expect, it } from "vitest";
import { mechanicLabel, computeMechanicBreakdown } from "@/lib/stats";

describe("mechanicLabel", () => {
  it("maps stamp to Stamp", () => {
    expect(mechanicLabel("stamp")).toBe("Stamp");
  });

  it("maps plant to Growth", () => {
    expect(mechanicLabel("plant")).toBe("Growth");
  });

  it.each(["lucky", "wheel", "scratch"])("maps %s to Chance Card", (type) => {
    expect(mechanicLabel(type)).toBe("Chance Card");
  });

  it("falls back to Stamp for an unrecognized type", () => {
    expect(mechanicLabel("unknown")).toBe("Stamp");
  });
});

describe("computeMechanicBreakdown", () => {
  const programs = [
    { id: "p-stamp", type: "stamp" },
    { id: "p-plant", type: "plant" },
    { id: "p-lucky", type: "lucky" },
  ];
  const cards = [
    { id: "c1", program_id: "p-stamp" },
    { id: "c2", program_id: "p-stamp" },
    { id: "c3", program_id: "p-plant" },
    { id: "c4", program_id: "p-lucky" },
  ];

  it("buckets enrolled/visits/rewards by mechanic", () => {
    const activityEvents = [
      { card_id: "c1", kind: "stamp", created_at: "2026-01-01" },
      { card_id: "c1", kind: "stamp", created_at: "2026-01-02" },
      { card_id: "c3", kind: "visit", created_at: "2026-01-01" },
      { card_id: "c4", kind: "visit", created_at: "2026-01-01" },
    ];
    const rewardEvents = [
      { card_id: "c1", kind: "redeem", created_at: "2026-01-03" },
    ];

    const result = computeMechanicBreakdown(
      programs,
      cards,
      activityEvents,
      rewardEvents,
    );

    const stamp = result.find((r) => r.mechanic === "Stamp");
    const growth = result.find((r) => r.mechanic === "Growth");
    const chance = result.find((r) => r.mechanic === "Chance Card");

    expect(stamp).toEqual({
      mechanic: "Stamp",
      enrolled: 2,
      visitsTotal: 2,
      rewardsTotal: 1,
      redemptionRate: 0.5,
    });
    expect(growth).toEqual({
      mechanic: "Growth",
      enrolled: 1,
      visitsTotal: 1,
      rewardsTotal: 0,
      redemptionRate: 0,
    });
    expect(chance).toEqual({
      mechanic: "Chance Card",
      enrolled: 1,
      visitsTotal: 1,
      rewardsTotal: 0,
      redemptionRate: 0,
    });
  });

  it("sorts by visitsTotal descending", () => {
    const activityEvents = [
      { card_id: "c3", kind: "visit", created_at: "2026-01-01" },
      { card_id: "c3", kind: "visit", created_at: "2026-01-02" },
      { card_id: "c3", kind: "visit", created_at: "2026-01-03" },
      { card_id: "c1", kind: "stamp", created_at: "2026-01-01" },
    ];
    const result = computeMechanicBreakdown(
      programs,
      cards,
      activityEvents,
      [],
    );
    expect(result[0].mechanic).toBe("Growth");
  });

  it("returns an empty array for no cards", () => {
    expect(computeMechanicBreakdown(programs, [], [], [])).toEqual([]);
  });
});
