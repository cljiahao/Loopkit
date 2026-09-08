import { describe, expect, it } from "vitest";
import {
  shouldShowQr,
  buildGreeting,
  buildBriefing,
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
