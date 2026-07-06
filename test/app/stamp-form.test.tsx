// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import * as React from "react";
import { STAMP_IDLE, type StampState } from "@/app/dashboard/stamp-state";

vi.mock("@/app/dashboard/actions", () => ({
  stampAction: vi.fn(),
  redeemAction: vi.fn(),
}));

// useActionState needs a real submission cycle to reach a non-idle state,
// which is hard to drive in a unit test — stub it so we can render each
// branch (idle vs. reward-ready) directly.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: vi.fn() };
});

import { StampForm } from "@/app/dashboard/stamp-form";

const mockUseActionState = vi.mocked(React.useActionState);

describe("StampForm", () => {
  it("renders the phone input and Add stamp button", () => {
    mockUseActionState.mockReturnValue([STAMP_IDLE, vi.fn(), false]);
    render(<StampForm stampsRequired={10} />);
    expect(screen.getByLabelText("Customer phone")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add stamp" }),
    ).toBeInTheDocument();
  });

  it("shows the reward-ready note and a Redeem button once the card is full", () => {
    const state: StampState = {
      status: "ok",
      card: { id: "card-1", phone: "+6591234567", stamp_count: 10 },
      rewardReady: true,
    };
    mockUseActionState.mockReturnValue([state, vi.fn(), false]);
    render(<StampForm stampsRequired={10} />);
    expect(screen.getByText("Reward ready!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redeem" })).toBeInTheDocument();
  });
});
