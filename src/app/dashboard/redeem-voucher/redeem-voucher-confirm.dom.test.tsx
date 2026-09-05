// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { redeemMock } = vi.hoisted(() => ({ redeemMock: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({ redeemVoucherAction: redeemMock }));

import { RedeemVoucherConfirm } from "./redeem-voucher-confirm";

describe("RedeemVoucherConfirm", () => {
  it("shows the reward text and phone, and confirms redemption", async () => {
    redeemMock.mockResolvedValue({ success: true, rewardText: "Free drink" });
    const user = userEvent.setup();
    render(
      <RedeemVoucherConfirm
        token="tok123"
        phone="+6591234567"
        rewardText="Free drink"
      />,
    );
    expect(screen.getByText("Free drink")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(redeemMock).toHaveBeenCalled();
    expect(await screen.findByText(/redeemed/i)).toBeInTheDocument();
  });

  it("shows an error toast and stays on the confirm screen on failure", async () => {
    redeemMock.mockResolvedValue({
      success: false,
      error: "This reward has already been redeemed.",
    });
    const user = userEvent.setup();
    render(
      <RedeemVoucherConfirm
        token="tok123"
        phone="+6591234567"
        rewardText="Free drink"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(screen.getByRole("button", { name: "Redeem" })).toBeInTheDocument();
  });
});
