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
    onResolved: (
      result:
        | { kind: "card"; phone: string; programId: string }
        | {
            kind: "voucher";
            phone: string;
            voucherToken: string;
            rewardText: string;
          },
    ) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onResolved({ kind: "card", phone: "+6591234567", programId: "p9" })
        }
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() =>
          onResolved({
            kind: "voucher",
            phone: "+6591234567",
            voucherToken: "tok123",
            rewardText: "Free drink",
          })
        }
      >
        Scan voucher
      </button>
    </>
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

  it("routes a voucher scan to the redeem-voucher screen", async () => {
    const user = userEvent.setup();
    render(<ScanAndRoute />);
    await user.click(screen.getByRole("button", { name: "Scan voucher" }));
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/redeem-voucher?token=tok123",
    );
  });
});
