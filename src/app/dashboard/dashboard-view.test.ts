import { describe, expect, it } from "vitest";
import {
  shouldShowQr,
  buildGreeting,
  buildBriefing,
  splitTrend,
} from "@/app/dashboard/dashboard-view";

describe("shouldShowQr", () => {
  it("hides the shop QR block when there are zero active programs", () => {
    // Regression guard: the QR block invites customers to scan and join
    // "your programs" — it must not render alongside the "none of your
    // programs are active" empty state (dashboard/page.tsx).
    expect(shouldShowQr(0)).toBe(false);
  });

  it("shows the shop QR block when at least one program is active", () => {
    expect(shouldShowQr(1)).toBe(true);
    expect(shouldShowQr(3)).toBe(true);
  });
});

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
