// @vitest-environment jsdom
// src/features/card-check/components/check-form.dom.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { checkStatusActionMock, forgetProofMock } = vi.hoisted(() => ({
  forgetProofMock: vi.fn(),
  checkStatusActionMock: vi.fn(),
}));

vi.mock("../api/actions", () => ({
  checkStatusAction: checkStatusActionMock,
}));

vi.mock("@/lib/customer-proof-actions", () => ({
  forgetCustomerProof: forgetProofMock,
}));

import { CheckForm } from "./check-form";
import { STATUS_IDLE } from "../types";

describe("CheckForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetProofMock.mockResolvedValue({ success: true });
  });
  it("explicitly forgets this shop proof before submitting a different customer", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "none",
      message: "No rewards",
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.click(
      screen.getByRole("button", { name: "Forget saved card on this browser" }),
    );
    expect(forgetProofMock).toHaveBeenCalledWith("v1");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved card forgotten",
    );
    expect(checkStatusActionMock).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Your phone number"), "98888888");
    await user.click(screen.getByRole("button", { name: "Check my card" }));
    expect(checkStatusActionMock).toHaveBeenCalled();
    expect(forgetProofMock.mock.invocationCallOrder[0]).toBeLessThan(
      checkStatusActionMock.mock.invocationCallOrder[0],
    );
  });
  it("allows retry after forgetting saved proof rejects", async () => {
    forgetProofMock.mockRejectedValueOnce(new Error("unavailable"));
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    const button = screen.getByRole("button", {
      name: "Forget saved card on this browser",
    });
    await user.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Could not forget",
    );
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved card forgotten",
    );
  });

  it("renders the phone input and submit button with the vendor id in a hidden field", () => {
    const { container } = render(<CheckForm vendorId="v1" />);
    expect(screen.getByLabelText("Your phone number")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Check my card" }),
    ).toBeInTheDocument();
    const hidden = container.querySelector('input[name="vendor"]');
    expect(hidden).toHaveValue("v1");
  });

  it("renders no hidden ref field when no referral code is given", () => {
    const { container } = render(<CheckForm vendorId="v1" />);
    expect(container.querySelector('input[name="ref"]')).toBeNull();
  });

  it("renders the referral code in a hidden ref field when given", () => {
    const { container } = render(
      <CheckForm vendorId="v1" referralCode="abc123" />,
    );
    const hidden = container.querySelector('input[name="ref"]');
    expect(hidden).toHaveValue("abc123");
  });

  it("submits the phone and vendor id, then renders a ProgramCardStatus per returned card", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "found",
      phone: "+6591234567",
      cards: [
        {
          programId: "p1",
          name: "Kaya Toast Co.",
          label: "3/10 stamps",
          view: { kind: "dots", filled: 3, total: 10, variant: "dots" },
          rewardReady: false,
          reward_text: "Free kopi",
          qr: "",
          expired: false,
          active: true,
          replacedByName: null,
          carriedOverCount: null,
          activeVouchers: [],
        },
      ],
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByText("Kaya Toast Co.")).toBeInTheDocument();
    expect(checkStatusActionMock).toHaveBeenCalledWith(
      STATUS_IDLE,
      expect.any(FormData),
    );
  });

  it("shows a role=alert message when the action returns an error", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "123");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid Singapore phone number.",
    );
  });

  it("shows a role=alert message when the action finds nothing", async () => {
    checkStatusActionMock.mockResolvedValue({
      status: "none",
      message: "We couldn't find any rewards here.",
    });
    const user = userEvent.setup();
    render(<CheckForm vendorId="v1" />);
    await user.type(screen.getByLabelText("Your phone number"), "91234567");
    await user.click(screen.getByRole("button", { name: "Check my card" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't find any rewards here.",
    );
  });
});
