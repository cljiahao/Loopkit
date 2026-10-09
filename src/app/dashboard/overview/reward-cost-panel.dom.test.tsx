// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RewardCostPanel } from "./reward-cost-panel";
import type { CostView } from "@/app/dashboard/dashboard-view";

const cost = (over: Partial<CostView> = {}): CostView => ({
  rewardsThisMonth: 17,
  knownCostCents: 3300,
  programsMissingCost: 0,
  expiredUnclaimed: 8,
  pendingReturnSoon: 23,
  perProgram: [
    {
      id: "stamp",
      name: "Stamp Card",
      rewardText: "kopi-o",
      unitCents: 80,
      redeemed: 12,
      lineCents: 960,
    },
    {
      id: "plant",
      name: "Sprout Club",
      rewardText: "$15 voucher",
      unitCents: null,
      redeemed: 1,
      lineCents: null,
    },
  ],
  ...over,
});

describe("RewardCostPanel", () => {
  it("shows the summary numbers", () => {
    render(<RewardCostPanel cost={cost()} />);
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("$33.00")).toBeInTheDocument();
    expect(screen.getByText(/23/)).toBeInTheDocument();
    expect(screen.getByText(/expired unclaimed/)).toBeInTheDocument();
  });

  it("adds a missing-cost note only when a program has no cost set", () => {
    const { rerender } = render(<RewardCostPanel cost={cost()} />);
    expect(screen.queryByText(/no cost set/)).toBeNull();
    rerender(<RewardCostPanel cost={cost({ programsMissingCost: 1 })} />);
    expect(screen.getByText(/1 program has no cost set/)).toBeInTheDocument();
    expect(screen.getByText("$33.00+")).toBeInTheDocument();
  });

  it("lists every program in the breakdown", () => {
    render(<RewardCostPanel cost={cost()} />);
    expect(screen.getByText(/12 x kopi-o/)).toBeInTheDocument();
    expect(screen.getByText(/1 x \$15 voucher/)).toBeInTheDocument();
    expect(screen.getByText("cost not set")).toBeInTheDocument();
  });
});

it("keeps duplicate program names as distinct cost rows", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const value = cost();
    value.perProgram = value.perProgram.map((program) => ({
      ...program,
      name: "Same name",
    }));
    render(<RewardCostPanel cost={value} />);
    expect(screen.getByText(/12 x kopi-o/)).toBeInTheDocument();
    expect(screen.getByText(/1 x \$15 voucher/)).toBeInTheDocument();
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/same key/);
  } finally {
    error.mockRestore();
  }
});
