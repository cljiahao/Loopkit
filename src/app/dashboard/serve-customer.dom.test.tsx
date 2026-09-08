// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  stampAction,
  recordVisitAction,
  lookupAction,
  redeemPlantAction,
  regenerateCardAction,
  adjustStampAction,
  routerRefresh,
  routerPush,
  servedProps,
} = vi.hoisted(() => ({
  stampAction: vi.fn(),
  recordVisitAction: vi.fn(),
  lookupAction: vi.fn(),
  redeemPlantAction: vi.fn(),
  regenerateCardAction: vi.fn(),
  adjustStampAction: vi.fn(),
  routerRefresh: vi.fn(),
  routerPush: vi.fn(),
  servedProps: { current: null as null | Record<string, unknown> },
}));

vi.mock("@/app/dashboard/actions", () => ({
  stampAction,
  recordVisitAction,
  lookupAction,
  redeemPlantAction,
  regenerateCardAction,
  adjustStampAction,
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush }),
}));
vi.mock("@/app/dashboard/counter/scan-hero", () => ({
  ScanHero: () => <div data-testid="scan-hero" />,
}));
vi.mock("@/app/dashboard/counter/new-customer-panel", () => ({
  NewCustomerPanel: () => <div data-testid="new-customer-panel" />,
}));
vi.mock("@/app/dashboard/counter/shop-join-poster", () => ({
  ShopJoinPoster: () => <div data-testid="shop-join-poster" />,
}));
vi.mock("@/app/dashboard/counter/served-strip", () => ({
  ServedStrip: (props: Record<string, unknown>) => {
    servedProps.current = props;
    return <div data-testid="served-strip" />;
  },
}));

import { ServeCustomer } from "@/app/dashboard/serve-customer";

const baseProps = {
  programId: "p1",
  type: "stamp",
  stampsRequired: 8,
  rewardText: "a free coffee",
  shopName: "Kopi Corner",
  shopJoinQrSvg: "<svg></svg>",
  shopJoinLink: "https://loopkit.app/c?v=v1",
};

describe("ServeCustomer (scan-first)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    servedProps.current = null;
  });

  it("renders the scan hero and the empty active-card state first", () => {
    render(<ServeCustomer {...baseProps} />);
    expect(screen.getByTestId("scan-hero")).toBeInTheDocument();
    expect(screen.getByText(/no customer yet/i)).toBeInTheDocument();
  });

  it("keeps the manual phone form inside a collapsed details fallback", () => {
    render(<ServeCustomer {...baseProps} />);
    expect(
      screen.getByText(/existing customer who can.t scan/i),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Customer phone");
    expect(input.closest("details")).not.toBeNull();
  });

  it("toggles the New customer and Shop join QR panels one at a time", async () => {
    const user = userEvent.setup();
    render(<ServeCustomer {...baseProps} />);

    const newBtn = screen.getByRole("button", { name: "New customer" });
    const qrBtn = screen.getByRole("button", { name: "Shop join QR" });

    expect(newBtn).toHaveAttribute("aria-expanded", "false");
    await user.click(newBtn);
    expect(newBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("new-customer-panel")).toBeInTheDocument();

    await user.click(qrBtn);
    expect(newBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("new-customer-panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("shop-join-poster")).toBeInTheDocument();
  });

  it("records a stamp from the manual form and pushes an undoable served entry", async () => {
    const user = userEvent.setup();
    stampAction.mockResolvedValue({
      success: true,
      card: { id: "c1", phone: "+6591234567", stamp_count: 7 },
      rewardReady: false,
    });
    render(<ServeCustomer {...baseProps} />);

    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    expect(stampAction).toHaveBeenCalledTimes(1);
    const active = screen.getByText("+6591234567").closest("div")!;
    expect(within(active).getByText(/7 \/ 8 stamps/)).toBeInTheDocument();

    const entries = servedProps.current?.entries as Array<{
      undoable: boolean;
      note: string;
    }>;
    expect(entries).toHaveLength(1);
    expect(entries[0].undoable).toBe(true);
    expect(entries[0].note).toBe("6 to 7 of 8");
  });

  it("undoes the last stamp via adjustStampAction with delta -1", async () => {
    const user = userEvent.setup();
    stampAction.mockResolvedValue({
      success: true,
      card: { id: "c1", phone: "+6591234567", stamp_count: 7 },
      rewardReady: false,
    });
    adjustStampAction.mockResolvedValue({
      success: true,
      card: { id: "c1", phone: "+6591234567", stamp_count: 6 },
      rewardReady: false,
    });
    render(<ServeCustomer {...baseProps} />);

    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    const onUndo = servedProps.current?.onUndo as (e: unknown) => void;
    const entry = (servedProps.current?.entries as unknown[])[0];
    await act(async () => {
      await onUndo(entry);
    });

    expect(adjustStampAction).toHaveBeenCalledTimes(1);
    const fd = adjustStampAction.mock.calls[0][0] as FormData;
    expect(fd.get("delta")).toBe("-1");
    expect(fd.get("reason")).toBe("undo");
    expect(fd.get("phone")).toBe("+6591234567");
  });
});
