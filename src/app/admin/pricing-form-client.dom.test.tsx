// src/app/admin/pricing-form-client.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { setPricingMock, toastSuccessMock, toastErrorMock, refreshMock } =
  vi.hoisted(() => ({
    setPricingMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    refreshMock: vi.fn(),
  }));

vi.mock("./actions", () => ({ setPricing: setPricingMock }));
vi.mock("sonner", () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { PricingFormClient } from "./pricing-form-client";

describe("PricingFormClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves the new monthly price, toasts success, and refreshes", async () => {
    setPricingMock.mockResolvedValue({ success: true });
    render(
      <PricingFormClient initial={{ monthly_cents: 499, currency: "SGD" }} />,
    );

    fireEvent.change(screen.getByLabelText(/monthly/i), {
      target: { value: "5.99" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(setPricingMock).toHaveBeenCalledWith({ monthly_cents: 599 }),
    );
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("toasts the server error and does not refresh when setPricing fails", async () => {
    setPricingMock.mockResolvedValue({ success: false, error: "nope" });
    render(
      <PricingFormClient initial={{ monthly_cents: 499, currency: "SGD" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith("nope"));
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
