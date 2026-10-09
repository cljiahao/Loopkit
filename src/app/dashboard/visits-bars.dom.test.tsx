// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisitsBars } from "./visits-bars";
import { VisitsChart } from "./stats/visits-chart";
describe("visits bars", () => {
  const data = [
    { date: "2026-09-01", count: 0 },
    { date: "2026-09-02", count: 10 },
  ];
  it("retains zero-bar visibility, relative scale and prior-period styling", () => {
    const { container } = render(<VisitsBars data={data} priorCount={1} />);
    const bars = container.querySelectorAll<HTMLElement>(".rounded-t");
    expect(bars[0].style.height).toBe("4%");
    expect(bars[1].style.height).toBe("100%");
    expect(bars[0]).toHaveClass("bg-primary/30");
    expect(bars[1]).toHaveClass("bg-primary/70");
    expect(bars[0].title).toBe("1 Sept: 0");
  });
  it("retains Stats raw-date titles", () => {
    render(<VisitsChart data={data} />);
    expect(screen.getByTitle("2026-09-02: 10")).toBeInTheDocument();
  });
  it("renders a baseline without axes for no visits", () => {
    const { container } = render(<VisitsBars data={[]} />);
    expect(container.querySelectorAll(".rounded-t")).toHaveLength(0);
    expect(container.querySelector(".border-t")).toBeInTheDocument();
    expect(container.querySelector("span")).toBeNull();
  });
});
