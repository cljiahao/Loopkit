// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { stampMock, toastSuccess, toastError } = vi.hoisted(() => ({
  stampMock: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("@/app/dashboard/actions", () => ({ stampAction: stampMock }));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

import { NewCustomerPanel } from "./new-customer-panel";

describe("NewCustomerPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls stampAction with program_id and phone, fires onCreated, clears the input", async () => {
    const user = userEvent.setup();
    stampMock.mockResolvedValue({
      success: true,
      card: { id: "c1", phone: "+6591234567", stamp_count: 1 },
      rewardReady: false,
    });
    const onCreated = vi.fn();
    render(<NewCustomerPanel programId="p1" onCreated={onCreated} />);

    const input = screen.getByLabelText("Customer phone");
    await user.type(input, "9123 4567");
    await user.click(
      screen.getByRole("button", { name: /create card and first stamp/i }),
    );

    expect(stampMock).toHaveBeenCalledTimes(1);
    const fd = stampMock.mock.calls[0][0] as FormData;
    expect(fd.get("program_id")).toBe("p1");
    expect(fd.get("phone")).toBe("9123 4567");
    expect(onCreated).toHaveBeenCalledWith("+6591234567", {
      id: "c1",
      phone: "+6591234567",
      stamp_count: 1,
    });
    expect(input).toHaveValue("");
  });

  it("does not call onCreated and shows an error toast when stampAction fails", async () => {
    const user = userEvent.setup();
    stampMock.mockResolvedValue({ success: false, error: "bad number" });
    const onCreated = vi.fn();
    render(<NewCustomerPanel programId="p1" onCreated={onCreated} />);

    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(
      screen.getByRole("button", { name: /create card and first stamp/i }),
    );

    expect(onCreated).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith("bad number");
  });

  it("blocks an obviously-too-short number before calling the server", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<NewCustomerPanel programId="p1" onCreated={onCreated} />);

    await user.type(screen.getByLabelText("Customer phone"), "123");
    await user.click(
      screen.getByRole("button", { name: /create card and first stamp/i }),
    );

    expect(stampMock).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });
});
