// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { adjustStampAction } = vi.hoisted(() => ({
  adjustStampAction: vi.fn(),
}));
vi.mock("@/app/dashboard/actions", () => ({ adjustStampAction }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AdjustStampForm } from "./adjust-stamp-form";

describe("AdjustStampForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts collapsed behind an 'Adjust stamps' trigger", () => {
    render(<AdjustStampForm programId="p1" phone="+6591234567" />);
    expect(
      screen.getByRole("button", { name: "Adjust stamps" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Delta")).not.toBeInTheDocument();
  });

  it("reveals the delta/reason inputs once opened", async () => {
    const user = userEvent.setup();
    render(<AdjustStampForm programId="p1" phone="+6591234567" />);
    await user.click(screen.getByRole("button", { name: "Adjust stamps" }));
    expect(screen.getByLabelText("Delta")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toBeInTheDocument();
  });

  it("submits the program id, phone, delta, and reason", async () => {
    adjustStampAction.mockResolvedValue({
      success: true,
      card: { id: "c1", phone: "+6591234567", stamp_count: 6 },
      rewardReady: false,
    });
    const user = userEvent.setup();
    render(<AdjustStampForm programId="p1" phone="+6591234567" />);
    await user.click(screen.getByRole("button", { name: "Adjust stamps" }));
    await user.type(screen.getByLabelText("Delta"), "2");
    await user.type(
      screen.getByLabelText("Reason"),
      "Missed stamps from a system outage",
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(adjustStampAction).toHaveBeenCalledTimes(1);
    });
    const fd = adjustStampAction.mock.calls[0][0] as FormData;
    expect(fd.get("program_id")).toBe("p1");
    expect(fd.get("phone")).toBe("+6591234567");
    expect(fd.get("delta")).toBe("2");
    expect(fd.get("reason")).toBe("Missed stamps from a system outage");
  });

  it("collapses back to the trigger and confirms the new count on success", async () => {
    adjustStampAction.mockResolvedValue({
      success: true,
      card: { id: "c1", phone: "+6591234567", stamp_count: 6 },
      rewardReady: false,
    });
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<AdjustStampForm programId="p1" phone="+6591234567" />);
    await user.click(screen.getByRole("button", { name: "Adjust stamps" }));
    await user.type(screen.getByLabelText("Delta"), "2");
    await user.type(screen.getByLabelText("Reason"), "Correction");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Stamp count is now 6.");
    });
    expect(
      screen.getByRole("button", { name: "Adjust stamps" }),
    ).toBeInTheDocument();
  });

  it("stays open and shows an error toast when the action fails", async () => {
    adjustStampAction.mockResolvedValue({
      success: false,
      error: "No card found for this customer, or something went wrong.",
    });
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    render(<AdjustStampForm programId="p1" phone="+6591234567" />);
    await user.click(screen.getByRole("button", { name: "Adjust stamps" }));
    await user.type(screen.getByLabelText("Delta"), "1");
    await user.type(screen.getByLabelText("Reason"), "Correction");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "No card found for this customer, or something went wrong.",
      );
    });
    expect(screen.getByLabelText("Delta")).toBeInTheDocument();
  });
});
