// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { setCustomerBirthdayAction } = vi.hoisted(() => ({
  setCustomerBirthdayAction: vi.fn(),
}));
vi.mock("../api/actions", () => ({ setCustomerBirthdayAction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BirthdayField } from "./birthday-field";

describe("BirthdayField", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("disables Save until both month and day are picked", async () => {
    const user = userEvent.setup();
    render(<BirthdayField vendorId="v1" phone="+6591234567" />);

    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Birth month"), "6");
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Birth day"), "15");
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("submits the vendor, phone, month, and day on save", async () => {
    setCustomerBirthdayAction.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<BirthdayField vendorId="v1" phone="+6591234567" />);

    await user.selectOptions(screen.getByLabelText("Birth month"), "6");
    await user.selectOptions(screen.getByLabelText("Birth day"), "15");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(setCustomerBirthdayAction).toHaveBeenCalledTimes(1);
    });
    const fd = setCustomerBirthdayAction.mock.calls[0][0] as FormData;
    expect(fd.get("vendor")).toBe("v1");
    expect(fd.get("phone")).toBe("+6591234567");
    expect(fd.get("month")).toBe("6");
    expect(fd.get("day")).toBe("15");
  });

  it("shows a confirmation and hides the form after a successful save", async () => {
    setCustomerBirthdayAction.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<BirthdayField vendorId="v1" phone="+6591234567" />);

    await user.selectOptions(screen.getByLabelText("Birth month"), "6");
    await user.selectOptions(screen.getByLabelText("Birth day"), "15");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Birthday saved.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save/i }),
    ).not.toBeInTheDocument();
  });

  it("stays on the form and surfaces an error toast when the action fails", async () => {
    const { toast } = await import("sonner");
    setCustomerBirthdayAction.mockResolvedValue({
      success: false,
      error: "Something went wrong.",
    });
    const user = userEvent.setup();
    render(<BirthdayField vendorId="v1" phone="+6591234567" />);

    await user.selectOptions(screen.getByLabelText("Birth month"), "6");
    await user.selectOptions(screen.getByLabelText("Birth day"), "15");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Something went wrong.");
    });
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
  });
});
