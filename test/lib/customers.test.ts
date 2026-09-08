import { describe, it, expect } from "vitest";
import { aggregateCustomers } from "@/lib/customers";

describe("aggregateCustomers", () => {
  it("merges a customer's cards across programs into one row", () => {
    const customers = [
      {
        phone: "+6591234567",
        name: "Jane",
        first_seen_at: "2026-07-01T00:00:00Z",
        last_seen_at: "2026-07-10T00:00:00Z",
      },
    ];
    const cards = [
      {
        phone: "+6591234567",
        program_id: "p1",
        stamp_count: 3,
        reward_count: 1,
        updated_at: "2026-07-05T00:00:00Z",
      },
      {
        phone: "+6591234567",
        program_id: "p2",
        stamp_count: 5,
        reward_count: 0,
        updated_at: "2026-07-08T00:00:00Z",
      },
    ];
    const programsById = {
      p1: { name: "Coffee Stamps", stampsRequired: 8 },
      p2: { name: "Lucky Tap", stampsRequired: 10 },
    };

    const result = aggregateCustomers(customers, cards, programsById);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      phone: "+6591234567",
      name: "Jane",
      programNames: ["Coffee Stamps", "Lucky Tap"],
      totalStamps: 8,
      totalRewards: 1,
      lastSeenAt: "2026-07-10T00:00:00Z",
      firstSeenAt: "2026-07-01T00:00:00Z",
      rewardReady: false,
      bestGap: 5,
      recentProgramId: "p2",
      recentProgramName: "Lucky Tap",
    });
  });

  it("derives rewardReady, bestGap, and the most-recent program", () => {
    const customers = [
      {
        phone: "+6591110000",
        name: "A",
        first_seen_at: "2026-09-01T00:00:00Z",
        last_seen_at: "2026-09-08T00:00:00Z",
      },
    ];
    const cards = [
      {
        phone: "+6591110000",
        program_id: "p1",
        stamp_count: 7,
        updated_at: "2026-09-05T00:00:00Z",
      },
      {
        phone: "+6591110000",
        program_id: "p2",
        stamp_count: 9,
        updated_at: "2026-09-08T00:00:00Z",
      },
    ];
    const programsById = {
      p1: { name: "Stamp Card", stampsRequired: 8 },
      p2: { name: "Sprout Club", stampsRequired: 10 },
    };
    const [row] = aggregateCustomers(customers, cards, programsById);
    expect(row.bestGap).toBe(1); // p1: 8-7=1, p2: 10-9=1
    expect(row.rewardReady).toBe(false);
    expect(row.recentProgramId).toBe("p2"); // latest updated_at
    expect(row.recentProgramName).toBe("Sprout Club");
    expect(row.firstSeenAt).toBe("2026-09-01T00:00:00Z");
  });

  it("rewardReady is true when a card is at or past its requirement", () => {
    const [row] = aggregateCustomers(
      [
        {
          phone: "+6591110001",
          name: null,
          first_seen_at: "2026-09-01T00:00:00Z",
          last_seen_at: "2026-09-08T00:00:00Z",
        },
      ],
      [
        {
          phone: "+6591110001",
          program_id: "p1",
          stamp_count: 8,
          updated_at: "2026-09-08T00:00:00Z",
        },
      ],
      { p1: { name: "Stamp Card", stampsRequired: 8 } },
    );
    expect(row.rewardReady).toBe(true);
    expect(row.bestGap).toBe(0);
  });

  it("null progress fields when the phone has no cards", () => {
    const [row] = aggregateCustomers(
      [
        {
          phone: "+6591110002",
          name: null,
          first_seen_at: "2026-09-01T00:00:00Z",
          last_seen_at: "2026-09-08T00:00:00Z",
        },
      ],
      [],
      {},
    );
    expect(row.bestGap).toBeNull();
    expect(row.rewardReady).toBe(false);
    expect(row.recentProgramId).toBeNull();
  });

  it("handles a customer with no matching cards (defensive — sync should prevent this in practice)", () => {
    const customers = [
      {
        phone: "+6598765432",
        name: null,
        first_seen_at: "2026-06-20T00:00:00Z",
        last_seen_at: "2026-07-01T00:00:00Z",
      },
    ];
    const result = aggregateCustomers(customers, [], {});
    expect(result[0]).toEqual({
      phone: "+6598765432",
      name: null,
      programNames: [],
      totalStamps: 0,
      totalRewards: 0,
      lastSeenAt: "2026-07-01T00:00:00Z",
      firstSeenAt: "2026-06-20T00:00:00Z",
      rewardReady: false,
      bestGap: null,
      recentProgramId: null,
      recentProgramName: null,
    });
  });

  it("sorts by lastSeenAt descending", () => {
    const customers = [
      {
        phone: "+65111",
        name: null,
        first_seen_at: "2026-06-01T00:00:00Z",
        last_seen_at: "2026-07-01T00:00:00Z",
      },
      {
        phone: "+65222",
        name: null,
        first_seen_at: "2026-06-01T00:00:00Z",
        last_seen_at: "2026-07-10T00:00:00Z",
      },
    ];
    const result = aggregateCustomers(customers, [], {});
    expect(result.map((r) => r.phone)).toEqual(["+65222", "+65111"]);
  });

  it("does not duplicate a program name when a customer has 2 cards in the same program (should not happen, but defensive)", () => {
    const customers = [
      {
        phone: "+65333",
        name: null,
        first_seen_at: "2026-06-01T00:00:00Z",
        last_seen_at: "2026-07-01T00:00:00Z",
      },
    ];
    const cards = [
      {
        phone: "+65333",
        program_id: "p1",
        stamp_count: 1,
        updated_at: "2026-07-01T00:00:00Z",
      },
      {
        phone: "+65333",
        program_id: "p1",
        stamp_count: 1,
        updated_at: "2026-07-01T00:00:00Z",
      },
    ];
    const result = aggregateCustomers(customers, cards, {
      p1: { name: "Coffee Stamps", stampsRequired: 8 },
    });
    expect(result[0].programNames).toEqual(["Coffee Stamps"]);
    expect(result[0].totalStamps).toBe(2);
  });
});
