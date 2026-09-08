// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { YourPrograms } from "./your-programs";
import type { OverviewProgram } from "@/app/dashboard/dashboard-view";

const program = (over: Partial<OverviewProgram> = {}): OverviewProgram => ({
  id: "p1",
  name: "Stamp Card",
  type: "stamp",
  returnRate: 0.61,
  rewardText: "kopi",
  rewardCostCents: 80,
  rewardsThisMonth: 3,
  ...over,
});

describe("YourPrograms", () => {
  it("renders nothing with fewer than two programs", () => {
    const { container } = render(<YourPrograms programs={[program()]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an Edit and Serve link per program", () => {
    render(
      <YourPrograms
        programs={[
          program({ id: "p1", name: "Stamp Card" }),
          program({ id: "p2", name: "Sprout Club" }),
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Edit Stamp Card" }),
    ).toHaveAttribute("href", "/setup?id=p1");
    const serves = screen.getAllByRole("link", { name: "Serve" });
    expect(serves).toHaveLength(2);
    expect(serves[1]).toHaveAttribute("href", "/dashboard/counter?p=p2");
  });

  it("shows the fallback copy when a program has no return rate", () => {
    render(
      <YourPrograms
        programs={[
          program({ id: "p1", returnRate: null }),
          program({ id: "p2" }),
        ]}
      />,
    );
    expect(screen.getByText("not enough data")).toBeInTheDocument();
    expect(screen.getByText("61% come back")).toBeInTheDocument();
  });
});
