// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { stampMock, recordVisitMock, lookupMock, redeemPlantMock } = vi.hoisted(
  () => ({
    stampMock: vi.fn(),
    recordVisitMock: vi.fn(),
    lookupMock: vi.fn(),
    redeemPlantMock: vi.fn(),
  }),
);
vi.mock("@/app/dashboard/actions", () => ({
  stampAction: stampMock,
  recordVisitAction: recordVisitMock,
  lookupAction: lookupMock,
  redeemPlantAction: redeemPlantMock,
  redeemAction: vi.fn(),
  resolveTokenAction: vi.fn(),
}));

const { toast, toastSuccess, toastError } = vi.hoisted(() => {
  const success = vi.fn();
  const error = vi.fn();
  const fn = Object.assign(vi.fn(), { success, error });
  return { toast: fn, toastSuccess: success, toastError: error };
});
vi.mock("sonner", () => ({ toast }));

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: routerPush }),
}));

vi.mock("@/app/dashboard/scan-button", () => ({
  ScanButton: ({
    onResolved,
  }: {
    onResolved: (result: { phone: string; programId: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onResolved({ phone: "+6591234567", programId: "p2" })}
    >
      Mock scan
    </button>
  ),
}));

import { ServeCustomer } from "@/app/dashboard/serve-customer";

describe("ServeCustomer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the phone input, primary action, and Look up", () => {
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    expect(screen.getByLabelText("Customer phone")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add stamp" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Look up" })).toBeInTheDocument();
  });

  it("stamps, toasts, shows the card, and clears the input", async () => {
    stampMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 3 },
      rewardReady: false,
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    const input = screen.getByLabelText("Customer phone") as HTMLInputElement;
    await user.type(input, "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    await waitFor(() => expect(stampMock).toHaveBeenCalled());
    expect(toastSuccess).toHaveBeenCalled();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(input.value).toBe("");
  });

  it("surfaces a Redeem button once the stamped card is full", async () => {
    stampMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 10 },
      rewardReady: true,
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    await waitFor(() =>
      expect(screen.getByText("Reward ready!")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nice!" }));

    expect(screen.getByRole("button", { name: "Redeem" })).toBeInTheDocument();
  });

  it("toasts an error and shows no card on failure", async () => {
    stampMock.mockResolvedValue({ success: false, error: "Bad number." });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Bad number."));
    expect(screen.queryByText("Reward ready!")).not.toBeInTheDocument();
  });

  it("looks up a card without mutating and shares the same result card", async () => {
    lookupMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 10 },
      progress: {
        view: { kind: "dots", filled: 10, total: 10 },
        label: "10/10 stamps",
        rewardReady: true,
      },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(lookupMock).toHaveBeenCalled());
    expect(stampMock).not.toHaveBeenCalled();
    expect(screen.getByText("Reward ready!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redeem" })).toBeInTheDocument();
  });

  it("labels the primary action per type", () => {
    const { rerender } = render(
      <ServeCustomer
        programId="p1"
        type="lucky"
        stampsRequired={5}
        rewardText="A prize"
      />,
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    rerender(
      <ServeCustomer
        programId="p1"
        type="plant"
        stampsRequired={8}
        rewardText="A bloom"
      />,
    );
    expect(screen.getByRole("button", { name: "Water" })).toBeInTheDocument();
  });

  it("plays a lucky round and shows the win state", async () => {
    recordVisitMock.mockResolvedValue({
      success: true,
      rewardUnlocked: true,
      reward_text: "A prize",
      phone: "+6591234567",
      progress: { view: { kind: "dots", filled: 0, total: 5 }, label: "" },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="lucky"
        stampsRequired={5}
        rewardText="A prize"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Play" }));

    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled());
    expect(screen.getByText("🎉 Won A prize!")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).toBeInTheDocument();
  });

  it("does not celebrate a lucky round with no win", async () => {
    recordVisitMock.mockResolvedValue({
      success: true,
      rewardUnlocked: false,
      reward_text: "A prize",
      phone: "+6591234567",
      progress: { view: { kind: "dots", filled: 0, total: 5 }, label: "" },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="lucky"
        stampsRequired={5}
        rewardText="A prize"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Play" }));

    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled());
    expect(
      screen.queryByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).not.toBeInTheDocument();
  });

  it("redirects to the scanned card's own Counter page when it belongs to a different program", async () => {
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Mock scan" }));
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/counter?p=p2&phone=%2B6591234567",
    );
    expect(stampMock).not.toHaveBeenCalled();
  });

  it("fills and submits in place when the scanned card matches the current program", async () => {
    stampMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 3 },
      rewardReady: false,
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p2"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Mock scan" }));
    await waitFor(() => expect(stampMock).toHaveBeenCalled());
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("shows carryover wording in the plant redeem confirm dialog", async () => {
    lookupMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 0 },
      progress: {
        view: {
          kind: "plant",
          stage: 4,
          stageName: "Bloom",
          totalStages: 5,
          wilting: false,
          variant: "plant",
        },
        label: "Bloom",
        rewardReady: true,
      },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="plant"
        stampsRequired={8}
        rewardText="A bloom"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(lookupMock).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(
      screen.getByText(
        "Redeem A bloom for +6591234567? Any extra growth carries over to their next plant.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the not-yet-played label for a looked-up lucky card", async () => {
    lookupMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 0 },
      progress: { view: { kind: "dots", filled: 0, total: 5 }, label: "0/5" },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="lucky"
        stampsRequired={5}
        rewardText="A prize"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(lookupMock).toHaveBeenCalled());
    expect(screen.getByText("0/5")).toBeInTheDocument();
  });

  it("toasts an error and does not reset the form on a failed lucky play", async () => {
    recordVisitMock.mockResolvedValue({ success: false, error: "Bad number." });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="lucky"
        stampsRequired={5}
        rewardText="A prize"
      />,
    );
    const input = screen.getByLabelText("Customer phone") as HTMLInputElement;
    await user.type(input, "91234567");
    await user.click(screen.getByRole("button", { name: "Play" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Bad number."));
    expect(input.value).not.toBe("");
  });

  it("waters a plant and shows the bloom celebration when it unlocks", async () => {
    recordVisitMock.mockResolvedValue({
      success: true,
      rewardUnlocked: true,
      reward_text: "A bloom",
      phone: "+6591234567",
      progress: {
        view: {
          kind: "plant",
          stage: 4,
          stageName: "Bloom",
          totalStages: 5,
          wilting: false,
          variant: "plant",
        },
        label: "Bloom",
        rewardReady: true,
      },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="plant"
        stampsRequired={8}
        rewardText="A bloom"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Water" }));

    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled());
    expect(
      screen.getByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).toBeInTheDocument();
  });

  it("waters a plant with no bloom this time", async () => {
    recordVisitMock.mockResolvedValue({
      success: true,
      rewardUnlocked: false,
      reward_text: "A bloom",
      phone: "+6591234567",
      progress: {
        view: {
          kind: "plant",
          stage: 2,
          stageName: "Sprout",
          totalStages: 5,
          wilting: false,
          variant: "plant",
        },
        label: "Sprout",
        rewardReady: false,
      },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="plant"
        stampsRequired={8}
        rewardText="A bloom"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Water" }));

    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled());
    expect(
      screen.queryByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).not.toBeInTheDocument();
  });

  it("spins the wheel and shows the win celebration", async () => {
    recordVisitMock.mockResolvedValue({
      success: true,
      rewardUnlocked: true,
      reward_text: "A prize",
      phone: "+6591234567",
      progress: {
        view: {
          kind: "chance",
          variant: "wheel",
          segments: [{ id: "a", label: "Win", reward: true }],
          landedId: "a",
        },
        label: "Won!",
      },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="wheel"
        stampsRequired={1}
        rewardText="A prize"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Spin" }));

    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled());
    expect(
      screen.getByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).toBeInTheDocument();
  });

  it("scratches with no win this time", async () => {
    recordVisitMock.mockResolvedValue({
      success: true,
      rewardUnlocked: false,
      reward_text: "A prize",
      phone: "+6591234567",
      progress: {
        view: {
          kind: "chance",
          variant: "scratch",
          segments: [{ id: "a", label: "Try again", reward: false }],
          landedId: "a",
        },
        label: "No win",
      },
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="scratch"
        stampsRequired={1}
        rewardText="A prize"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Scratch" }));

    await waitFor(() => expect(recordVisitMock).toHaveBeenCalled());
    expect(
      screen.queryByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).not.toBeInTheDocument();
  });

  it("does not re-celebrate stamping the same already-reward-ready card twice in a row", async () => {
    stampMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 10 },
      rewardReady: true,
    });
    const user = userEvent.setup();
    render(
      <ServeCustomer
        programId="p1"
        type="stamp"
        stampsRequired={10}
        rewardText="Free kopi"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "🎉 Reward unlocked!" }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Nice!" }));

    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Add stamp" }));
    await waitFor(() => expect(stampMock).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole("heading", { name: "🎉 Reward unlocked!" }),
    ).not.toBeInTheDocument();
  });

  it("renders the Cup visual for a cup-variant plant program", async () => {
    lookupMock.mockResolvedValue({
      success: true,
      card: { id: "card-1", phone: "+6591234567", stamp_count: 0 },
      progress: {
        view: {
          kind: "plant",
          stage: 2,
          stageName: "Half Full",
          totalStages: 5,
          wilting: false,
          variant: "cup",
          filled: 4,
          total: 8,
        },
        label: "Half Full — 4/8",
        rewardReady: false,
      },
    });
    const user = userEvent.setup();
    const { container } = render(
      <ServeCustomer
        programId="p1"
        type="plant"
        stampsRequired={8}
        rewardText="Free kopi"
      />,
    );
    await user.type(screen.getByLabelText("Customer phone"), "91234567");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await waitFor(() =>
      expect(
        container.querySelector('[data-cup-coffee="true"]'),
      ).toBeInTheDocument(),
    );
  });
});
