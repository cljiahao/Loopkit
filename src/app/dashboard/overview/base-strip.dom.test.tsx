// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BaseStrip } from "./base-strip";
import { buildBaseStats } from "@/app/dashboard/dashboard-view";

const stats = buildBaseStats({ active: 38, newThisMonth: 9, lapsed: 4 });

describe("BaseStrip", () => {
  it("renders the four displays and labels", () => {
    render(
      <BaseStrip stats={stats} redemptionRatePct={42} returnRatePct={55} />,
    );
    for (const s of stats) {
      expect(screen.getByText(s.display)).toBeInTheDocument();
      expect(screen.getByText(s.label)).toBeInTheDocument();
    }
  });

  it("reveals a stat's body copy when its info trigger is tapped", () => {
    render(
      <BaseStrip stats={stats} redemptionRatePct={42} returnRatePct={55} />,
    );
    expect(screen.queryByText(stats[0].body)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: stats[0].title }));
    expect(screen.getByText(stats[0].body)).toBeInTheDocument();
  });

  it("renders the redemption and return-rate figures", () => {
    render(
      <BaseStrip stats={stats} redemptionRatePct={42} returnRatePct={55} />,
    );
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();
    expect(screen.getByText(/redeem their reward/)).toBeInTheDocument();
  });

  it("shows -- for a null return rate and no em dash anywhere", () => {
    const { container } = render(
      <BaseStrip stats={stats} redemptionRatePct={0} returnRatePct={null} />,
    );
    expect(screen.getByText("--%")).toBeInTheDocument();
    expect(container.textContent).not.toContain("—");
  });
});
