import { describe, expect, it } from "vitest";
import {
  buildGreeting,
  buildBriefing,
  splitTrend,
  buildBaseStats,
  buildCostView,
  buildOverviewModel,
  buildOverviewPrograms,
  pickServeDefault,
  type OverviewProgram,
  type BuildOverviewInput,
} from "@/app/dashboard/dashboard-view";
import type { ProgramStats } from "@/lib/stats";

describe("buildGreeting", () => {
  // SGT is UTC+8 with no DST. nowMs picked so SGT hour is unambiguous.
  const sgt = (h: number) => Date.UTC(2026, 8, 8, h - 8, 0, 0);
  it("morning before noon", () => {
    expect(buildGreeting(sgt(9))).toBe("Good morning");
  });
  it("afternoon noon to 17:59", () => {
    expect(buildGreeting(sgt(14))).toBe("Good afternoon");
  });
  it("evening 18:00 onward", () => {
    expect(buildGreeting(sgt(20))).toBe("Good evening");
  });
});

describe("buildBriefing", () => {
  it("states the regular count and cadence, no em dash", () => {
    const s = buildBriefing(41, 9.2, null);
    expect(s).toContain("41 regulars");
    expect(s).toContain("every 9 days");
    expect(s).not.toContain("—");
  });
  it("omits the cadence clause when avgDays is null", () => {
    const s = buildBriefing(3, null, null);
    expect(s).toContain("3 regulars");
    expect(s).not.toContain("every");
  });
  it("singular for one regular", () => {
    expect(buildBriefing(1, 5, null)).toContain("1 regular ");
  });
  it("adds the sooner/later clause when a prior cadence is given", () => {
    expect(buildBriefing(20, 9, 11)).toContain("2 days sooner");
    expect(buildBriefing(20, 12, 9)).toContain("3 days later");
  });
  it("handles zero regulars gracefully", () => {
    expect(buildBriefing(0, null, null)).toMatch(/No regulars yet|0 regulars/);
  });
});

const days = (counts: number[]) =>
  counts.map((count, i) => ({ date: `d${i}`, count }));

describe("splitTrend", () => {
  it("bars7 is the last 7 days, bars14 the last 14", () => {
    const input = days(Array.from({ length: 30 }, (_, i) => i)); // 0..29
    const t = splitTrend(input);
    expect(t.bars7.map((b) => b.count)).toEqual([23, 24, 25, 26, 27, 28, 29]);
    expect(t.bars14).toHaveLength(14);
    expect(t.bars14[0].count).toBe(16);
  });
  it("deltaVsLastWeek is this-week sum minus prior-week sum", () => {
    // last 7 all 2 (sum 14), the 7 before all 1 (sum 7) -> +7
    const arr = Array(30).fill(0);
    for (let i = 23; i < 30; i++) arr[i] = 2;
    for (let i = 16; i < 23; i++) arr[i] = 1;
    expect(splitTrend(days(arr)).deltaVsLastWeek).toBe(7);
  });
  it("handles a short array without throwing", () => {
    const t = splitTrend(days([1, 2, 3]));
    expect(t.bars7).toHaveLength(3);
    expect(t.bars14).toHaveLength(3);
    expect(t.deltaVsLastWeek).toBe(0); // no prior week
  });
});

describe("buildBaseStats", () => {
  it("returns 4 stats in order regulars, new, lapsed, net", () => {
    const stats = buildBaseStats({ active: 38, newThisMonth: 9, lapsed: 4 });
    expect(stats.map((s) => s.key)).toEqual([
      "regulars",
      "new",
      "lapsed",
      "net",
    ]);
  });
  it("sign-formats the display strings", () => {
    const stats = buildBaseStats({ active: 38, newThisMonth: 9, lapsed: 4 });
    expect(stats.map((s) => s.display)).toEqual(["38", "+9", "-4", "+5"]);
  });
  it("net goes negative when lapsed outweighs new", () => {
    const stats = buildBaseStats({ active: 10, newThisMonth: 2, lapsed: 6 });
    expect(stats[3].display).toBe("-4");
  });
  it("new tone is pos only when positive, lapsed always soft", () => {
    const a = buildBaseStats({ active: 1, newThisMonth: 3, lapsed: 0 });
    expect(a[1].tone).toBe("pos");
    expect(a[2].tone).toBe("soft");
    const b = buildBaseStats({ active: 1, newThisMonth: 0, lapsed: 0 });
    expect(b[1].tone).toBe("plain");
    expect(b[1].display).toBe("0");
  });
  it("carries the regulars body copy verbatim from the mockup", () => {
    const stats = buildBaseStats({ active: 1, newThisMonth: 0, lapsed: 0 });
    expect(stats[0].body).toBe(
      "Visited 2 or more times, and back within the last 30 days.",
    );
  });
  it("has no em dash in any copy", () => {
    const stats = buildBaseStats({ active: 5, newThisMonth: 5, lapsed: 5 });
    for (const s of stats) {
      expect(`${s.label}${s.title}${s.body}${s.hint}`).not.toContain("—");
    }
  });
});

const program = (over: Partial<OverviewProgram> = {}): OverviewProgram => ({
  id: "p1",
  name: "Stamp Card",
  type: "stamp",
  returnRate: 0.6,
  rewardText: "free kopi",
  rewardCostCents: 80,
  rewardsThisMonth: 5,
  ...over,
});

describe("buildCostView", () => {
  it("sums known cost as unit cents times redeemed, per program", () => {
    const view = buildCostView(
      [
        program({ id: "a", rewardCostCents: 80, rewardsThisMonth: 5 }),
        program({ id: "b", rewardCostCents: null, rewardsThisMonth: 2 }),
      ],
      8,
      { oneAway: 3, twoAway: 4 },
    );
    expect(view.rewardsThisMonth).toBe(7);
    expect(view.knownCostCents).toBe(400);
    expect(view.programsMissingCost).toBe(1);
    expect(view.expiredUnclaimed).toBe(8);
    expect(view.pendingReturnSoon).toBe(7);
    expect(view.perProgram).toHaveLength(2);
    expect(view.perProgram[0].lineCents).toBe(400);
    expect(view.perProgram[1].lineCents).toBeNull();
  });
  it("does not count a missing cost when nothing was redeemed", () => {
    const view = buildCostView(
      [program({ rewardCostCents: null, rewardsThisMonth: 0 })],
      0,
      { oneAway: 0, twoAway: 0 },
    );
    expect(view.programsMissingCost).toBe(0);
  });
});

const stats = (over: Partial<ProgramStats> = {}): ProgramStats => ({
  enrolled: 50,
  newThisWeek: 3,
  visitsTotal: 400,
  visits30d: 90,
  visitsByDay: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    count: i,
  })),
  rewardsTotal: 20,
  rewards30d: 6,
  redemptionRate: 0.4,
  repeatVisitRate: 0.5,
  active: 30,
  lapsed: 20,
  avgVisitsPerCustomer: 8,
  visitsDelta: null,
  rewardsDelta: null,
  activeDelta: null,
  avgDaysBetweenVisits: 9,
  ...over,
});

const input = (over: Partial<BuildOverviewInput> = {}): BuildOverviewInput => ({
  nowMs: Date.UTC(2026, 8, 8, 6, 0, 0),
  vendorName: "Kopi Corner",
  stats: stats(),
  vendorReturnRate: 0.55,
  regularsCount: 41,
  newThisMonth: 9,
  goneQuiet: 6,
  near: { oneAway: 4, twoAway: 0 },
  expiredUnclaimed: 8,
  programs: [program()],
  serveDefaultProgramId: "p1",
  ...over,
});

describe("buildOverviewModel", () => {
  it("assembles greeting, briefing, base stats, trend", () => {
    const m = buildOverviewModel(input());
    expect(m.greeting).toBe(buildGreeting(input().nowMs));
    expect(m.briefing).toContain("41 regulars");
    expect(m.baseStats).toHaveLength(4);
    expect(m.trend.bars7).toHaveLength(7);
    expect(m.redemptionRatePct).toBe(40);
    expect(m.returnRatePct).toBe(55);
  });
  it("null vendor return rate stays null", () => {
    expect(
      buildOverviewModel(input({ vendorReturnRate: null })).returnRatePct,
    ).toBeNull();
  });
  it("worthALook keeps only non-zero items, gone-quiet first", () => {
    const m = buildOverviewModel(
      input({ goneQuiet: 6, near: { oneAway: 4, twoAway: 0 } }),
    );
    expect(m.worthALook).toEqual([
      { kind: "gone-quiet", count: 6 },
      { kind: "one-away", count: 4 },
    ]);
  });
  it("omits worthALook items that are zero", () => {
    const m = buildOverviewModel(
      input({ goneQuiet: 0, near: { oneAway: 0, twoAway: 2 } }),
    );
    expect(m.worthALook).toEqual([{ kind: "two-away", count: 2 }]);
  });
  it("passes programs and serve default through", () => {
    const m = buildOverviewModel(input({ serveDefaultProgramId: "p1" }));
    expect(m.programs).toHaveLength(1);
    expect(m.serveDefaultProgramId).toBe("p1");
    expect(m.cost.knownCostCents).toBe(400);
  });
});

const NOW = Date.UTC(2026, 8, 20, 6, 0, 0); // 2026-09-20 14:00 SGT
const ago = (days: number) => new Date(NOW - days * 86400000).toISOString();

describe("buildOverviewPrograms", () => {
  const programs = [
    {
      id: "p1",
      name: "Stamp Card",
      type: "stamp",
      reward_text: "kopi",
      reward_cost_cents: 80,
    },
    {
      id: "p2",
      name: "Sprout",
      type: "plant",
      reward_text: "cake",
      reward_cost_cents: null,
    },
  ];
  const cards = [
    { id: "c1", program_id: "p1", created_at: ago(50) },
    { id: "c2", program_id: "p1", created_at: ago(10) },
    { id: "c3", program_id: "p2", created_at: ago(5) },
  ];
  const activity = [
    { card_id: "c1", kind: "stamp", created_at: ago(40) },
    { card_id: "c1", kind: "stamp", created_at: ago(3) },
    { card_id: "c2", kind: "stamp", created_at: ago(2) },
  ];
  const rewards = [
    { card_id: "c1", kind: "redeem", created_at: ago(2) }, // this month
    { card_id: "c3", kind: "redeem", created_at: ago(40) }, // last month
  ];

  it("computes per-program return rate, reward fields and rewards this month", () => {
    const out = buildOverviewPrograms(programs, cards, activity, rewards, NOW);
    expect(out[0]).toMatchObject({
      id: "p1",
      rewardText: "kopi",
      rewardCostCents: 80,
      rewardsThisMonth: 1,
    });
    expect(out[0].returnRate).toBeGreaterThan(0);
    expect(out[1]).toMatchObject({
      rewardCostCents: null,
      rewardsThisMonth: 0,
      returnRate: null,
    });
  });
});

describe("pickServeDefault", () => {
  const programs = [{ id: "p1" }, { id: "p2" }];
  const cards = [
    { id: "c1", program_id: "p1", created_at: ago(1) },
    { id: "c2", program_id: "p2", created_at: ago(1) },
    { id: "c3", program_id: "p2", created_at: ago(1) },
  ];

  it("picks the program with the most 30-day-active cards", () => {
    const activity = [
      { card_id: "c1", kind: "stamp", created_at: ago(2) },
      { card_id: "c2", kind: "stamp", created_at: ago(2) },
      { card_id: "c3", kind: "stamp", created_at: ago(2) },
    ];
    expect(pickServeDefault(programs, cards, activity, NOW)).toBe("p2");
  });

  it("falls back to the first program when there is no recent activity", () => {
    expect(pickServeDefault(programs, cards, [], NOW)).toBe("p1");
  });
});
