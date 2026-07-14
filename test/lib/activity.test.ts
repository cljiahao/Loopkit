import { describe, it, expect } from "vitest";
import { aggregateActivity } from "@/lib/activity";

describe("aggregateActivity", () => {
  const cardsById = new Map([
    ["c1", { id: "c1", phone: "+6591111111", program_id: "p1" }],
    ["c2", { id: "c2", phone: "+6592222222", program_id: "p2" }],
  ]);
  const programNameById = { p1: "Coffee Stamps", p2: "Lucky Tap" };

  it("tags each event with its program name and phone", () => {
    const events = [
      {
        id: "e1",
        card_id: "c1",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
    ];
    const result = aggregateActivity(events, cardsById, programNameById);
    expect(result).toEqual([
      {
        id: "e1",
        phone: "+6591111111",
        programName: "Coffee Stamps",
        kind: "stamp",
        isReward: false,
        label: "stamp",
        createdAt: "2026-07-10T00:00:00Z",
      },
    ]);
  });

  it("marks redeem and won visits as rewards", () => {
    const events = [
      {
        id: "e1",
        card_id: "c1",
        kind: "redeem",
        created_at: "2026-07-10T00:00:00Z",
      },
      {
        id: "e2",
        card_id: "c2",
        kind: "visit",
        payload: { won: true },
        created_at: "2026-07-09T00:00:00Z",
      },
    ];
    const result = aggregateActivity(events, cardsById, programNameById);
    expect(result[0].isReward).toBe(true);
    expect(result[0].label).toBe("redeem");
    expect(result[1].isReward).toBe(true);
    expect(result[1].label).toBe("Won");
  });

  it("sorts newest first and caps at 15", () => {
    const events = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      card_id: "c1",
      kind: "stamp",
      created_at: new Date(2026, 6, i + 1).toISOString(),
    }));
    const result = aggregateActivity(events, cardsById, programNameById);
    expect(result).toHaveLength(15);
    expect(result[0].id).toBe("e19");
  });

  it("skips an event whose card is missing from cardsById (defensive)", () => {
    const events = [
      {
        id: "e1",
        card_id: "unknown",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
    ];
    expect(aggregateActivity(events, cardsById, programNameById)).toEqual([]);
  });
});
