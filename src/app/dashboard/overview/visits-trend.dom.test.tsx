// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisitsTrend } from "./visits-trend";

const bar = (i: number) => ({
  date: `2026-09-${String(i + 1).padStart(2, "0")}`,
  count: i,
});
const bars14 = Array.from({ length: 14 }, (_, i) => bar(i));
const bars7 = bars14.slice(-7);

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("VisitsTrend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders 7 bars and the 7-day caption on a narrow screen", () => {
    mockMatchMedia(false);
    const { container } = render(
      <VisitsTrend bars7={bars7} bars14={bars14} deltaVsLastWeek={3} />,
    );
    expect(container.querySelectorAll(".rounded-t")).toHaveLength(7);
    expect(screen.getByText("Visits, last 7 days")).toBeInTheDocument();
    expect(screen.getByText("up 3 vs last week")).toBeInTheDocument();
  });

  it("renders 14 bars and the 14-day caption on a wide screen", () => {
    mockMatchMedia(true);
    const { container } = render(
      <VisitsTrend bars7={bars7} bars14={bars14} deltaVsLastWeek={-2} />,
    );
    expect(container.querySelectorAll(".rounded-t")).toHaveLength(14);
    expect(screen.getByText("Visits, last 14 days")).toBeInTheDocument();
    expect(screen.getByText("down 2 vs last week")).toBeInTheDocument();
  });

  it("hides the delta when it is zero", () => {
    mockMatchMedia(false);
    render(<VisitsTrend bars7={bars7} bars14={bars14} deltaVsLastWeek={0} />);
    expect(screen.queryByText(/vs last week/)).toBeNull();
  });
});
