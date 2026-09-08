import { describe, it, expect } from "vitest";
import type { VendorCustomerRow } from "@/lib/customers";
import {
  customerSegments,
  filterBySegment,
  sortCustomers,
  segmentCounts,
  parseSegment,
  parseSort,
} from "@/lib/customer-segments";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 8, 8, 4, 0, 0); // 2026-09-08 12:00 SGT
const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

function row(over: Partial<VendorCustomerRow> = {}): VendorCustomerRow {
  return {
    phone: "+6590000000",
    name: null,
    programNames: [],
    totalStamps: 0,
    totalRewards: 0,
    lastSeenAt: iso(1),
    firstSeenAt: iso(1),
    rewardReady: false,
    bestGap: null,
    recentProgramId: null,
    recentProgramName: null,
    ...over,
  };
}

describe("customerSegments", () => {
  it("a recently-joined customer is all + new", () => {
    const segs = customerSegments(
      row({ lastSeenAt: iso(2), firstSeenAt: iso(3) }),
      now,
    );
    expect(segs.sort()).toEqual(["all", "new"]);
  });

  it("a reward-ready customer seen today is all + ready", () => {
    const segs = customerSegments(
      row({ lastSeenAt: iso(0), firstSeenAt: iso(60), rewardReady: true }),
      now,
    );
    expect(segs.sort()).toEqual(["all", "ready"]);
  });

  it("last seen 31 days ago is lapsed; exactly 30 days ago is not", () => {
    expect(
      customerSegments(
        row({ lastSeenAt: iso(31), firstSeenAt: iso(90) }),
        now,
      ).sort(),
    ).toEqual(["all", "lapsed"]);
    expect(
      customerSegments(row({ lastSeenAt: iso(30), firstSeenAt: iso(90) }), now),
    ).toEqual(["all"]);
  });

  it("first seen exactly 7 days ago is still new; 8 days is not", () => {
    expect(
      customerSegments(
        row({ firstSeenAt: iso(7), lastSeenAt: iso(1) }),
        now,
      ).includes("new"),
    ).toBe(true);
    expect(
      customerSegments(
        row({ firstSeenAt: iso(8), lastSeenAt: iso(1) }),
        now,
      ).includes("new"),
    ).toBe(false);
  });

  it("an unparseable firstSeenAt keeps the row in all, not in new, and does not throw", () => {
    const segs = customerSegments(
      row({ firstSeenAt: "not-a-date", lastSeenAt: iso(1) }),
      now,
    );
    expect(segs).toEqual(["all"]);
  });
});

describe("sortCustomers", () => {
  it("progress: gap asc, null gaps last", () => {
    const rows = [
      row({ phone: "a", bestGap: 3, lastSeenAt: iso(1) }),
      row({ phone: "b", bestGap: null, lastSeenAt: iso(1) }),
      row({ phone: "c", bestGap: 1, lastSeenAt: iso(1) }),
    ];
    expect(sortCustomers(rows, "progress").map((r) => r.phone)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("away: oldest last seen first", () => {
    const rows = [
      row({ phone: "a", lastSeenAt: iso(1) }),
      row({ phone: "b", lastSeenAt: iso(9) }),
      row({ phone: "c", lastSeenAt: iso(4) }),
    ];
    expect(sortCustomers(rows, "away").map((r) => r.phone)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("recent: newest last seen first", () => {
    const rows = [
      row({ phone: "a", lastSeenAt: iso(9) }),
      row({ phone: "b", lastSeenAt: iso(1) }),
    ];
    expect(sortCustomers(rows, "recent").map((r) => r.phone)).toEqual([
      "b",
      "a",
    ]);
  });

  it("does not mutate the input", () => {
    const rows = [
      row({ phone: "a", lastSeenAt: iso(1) }),
      row({ phone: "b", lastSeenAt: iso(9) }),
    ];
    const snapshot = rows.map((r) => r.phone);
    sortCustomers(rows, "away");
    expect(rows.map((r) => r.phone)).toEqual(snapshot);
  });
});

describe("filterBySegment", () => {
  it("all returns the rows unchanged", () => {
    const rows = [row({ phone: "a" }), row({ phone: "b" })];
    expect(filterBySegment(rows, "all", now)).toEqual(rows);
  });

  it("lapsed keeps only lapsed rows", () => {
    const rows = [
      row({ phone: "a", lastSeenAt: iso(40), firstSeenAt: iso(90) }),
      row({ phone: "b", lastSeenAt: iso(2), firstSeenAt: iso(90) }),
    ];
    expect(filterBySegment(rows, "lapsed", now).map((r) => r.phone)).toEqual([
      "a",
    ]);
  });
});

describe("segmentCounts", () => {
  it("counts each segment in one pass", () => {
    const rows = [
      row({ lastSeenAt: iso(2), firstSeenAt: iso(3) }), // new
      row({ lastSeenAt: iso(0), firstSeenAt: iso(90), rewardReady: true }), // ready
      row({ lastSeenAt: iso(40), firstSeenAt: iso(90) }), // lapsed
    ];
    expect(segmentCounts(rows, now)).toEqual({
      all: 3,
      ready: 1,
      new: 1,
      lapsed: 1,
    });
  });
});

describe("parseSegment / parseSort", () => {
  it("defaults on unknown or missing input", () => {
    expect(parseSegment("garbage")).toBe("all");
    expect(parseSegment(undefined)).toBe("all");
    expect(parseSort(undefined)).toBe("recent");
    expect(parseSort("nope")).toBe("recent");
  });

  it("passes a known value through", () => {
    expect(parseSegment("ready")).toBe("ready");
    expect(parseSort("progress")).toBe("progress");
  });
});
