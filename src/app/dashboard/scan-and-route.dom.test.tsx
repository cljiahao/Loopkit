// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("@/app/dashboard/scan-button", () => ({
  ScanButton: ({
    label,
    onResolved,
  }: {
    label?: string;
    onResolved: (result: { phone: string; programId: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onResolved({ phone: "+6591234567", programId: "p9" })}
    >
      {label}
    </button>
  ),
}));

import { ScanAndRoute } from "./scan-and-route";

describe("ScanAndRoute", () => {
  it("passes the 'Scan a customer' label to ScanButton", () => {
    render(<ScanAndRoute />);
    expect(
      screen.getByRole("button", { name: "Scan a customer" }),
    ).toBeInTheDocument();
  });

  it("routes to the resolved card's Counter page with phone pre-filled", async () => {
    const user = userEvent.setup();
    render(<ScanAndRoute />);
    await user.click(screen.getByRole("button", { name: "Scan a customer" }));
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/counter?p=p9&phone=%2B6591234567",
    );
  });
});
