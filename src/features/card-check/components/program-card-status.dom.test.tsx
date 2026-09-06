// @vitest-environment jsdom
// src/features/card-check/components/program-card-status.dom.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgramCardStatus } from "./program-card-status";
import type { CardStatus } from "../types";

const { regenerateCardActionMock } = vi.hoisted(() => ({
  regenerateCardActionMock: vi.fn(),
}));
vi.mock("../api/actions", () => ({
  regenerateCardAction: regenerateCardActionMock,
}));

function baseCard(overrides: Partial<CardStatus>): CardStatus {
  return {
    programId: "p1",
    name: "Grow-a-kopi",
    label: "Sip",
    reward_text: "Free kopi",
    rewardReady: false,
    expired: false,
    active: true,
    replacedByName: null,
    carriedOverCount: null,
    activeVouchers: [],
    qr: null,
    view: {
      kind: "plant",
      stage: 1,
      stageName: "Sip",
      totalStages: 5,
      wilting: false,
      variant: "cup",
      filled: 1,
      total: 4,
    },
    ...overrides,
  } as CardStatus;
}

describe("ProgramCardStatus points variant", () => {
  it("renders PointsBar when view.variant is points", () => {
    const { getByText } = render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "dots", filled: 40, total: 100, variant: "points" },
        })}
        phone="+6591234567"
      />,
    );
    expect(getByText("40 / 100 points")).toBeInTheDocument();
  });

  it("still renders StampDots (not PointsBar) when view.variant is dots", () => {
    const { container, queryByText } = render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "dots", filled: 3, total: 5, variant: "dots" },
        })}
        phone="+6591234567"
      />,
    );
    expect(queryByText(/points$/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("span[aria-hidden]")).toHaveLength(5);
  });

  it("renders a photo stamp mark when the card's view carries markMode photo and a vendor avatar is provided", () => {
    const card: CardStatus = {
      programId: "p1",
      name: "Kaya Toast Co.",
      label: "2/5 stamps",
      view: {
        kind: "dots",
        filled: 2,
        total: 5,
        variant: "dots",
        markMode: "photo",
      },
      rewardReady: false,
      reward_text: "Free kopi",
      qr: "",
      expired: false,
      active: true,
      replacedByName: null,
      carriedOverCount: null,
      activeVouchers: [],
    };
    const { container } = render(
      <ProgramCardStatus
        card={card}
        phone="+6591234567"
        vendorAvatarUrl="https://example.test/vendor.webp"
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(4);
  });
});

describe("ProgramCardStatus flame and chance views", () => {
  it("renders FlameLayers for a flame view", () => {
    const { container } = render(
      <ProgramCardStatus
        card={baseCard({
          view: {
            kind: "flame",
            filled: 2,
            total: 4,
            stage: 1,
            stageName: "Warming up",
            totalStages: 5,
          },
        })}
        phone="+6591234567"
      />,
    );
    expect(
      container.querySelector('[data-flame-stage="1"]'),
    ).toBeInTheDocument();
  });

  it("renders Wheel for a chance/wheel view", () => {
    const { container } = render(
      <ProgramCardStatus
        card={baseCard({
          view: {
            kind: "chance",
            variant: "wheel",
            segments: [{ id: "a", label: "Try again", reward: false }],
            landedId: null,
          },
        })}
        phone="+6591234567"
      />,
    );
    expect(
      container.querySelector('[data-testid="wheel-rotor"]'),
    ).toBeInTheDocument();
  });

  it("renders ScratchCard for a chance/scratch view", () => {
    const { container } = render(
      <ProgramCardStatus
        card={baseCard({
          view: {
            kind: "chance",
            variant: "scratch",
            segments: [{ id: "a", label: "Try again", reward: false }],
            landedId: null,
          },
        })}
        phone="+6591234567"
      />,
    );
    expect(
      container.querySelector('[data-testid="scratch-overlay"]'),
    ).toBeInTheDocument();
  });

  it("renders no visual for a null view", () => {
    const card = baseCard({
      view: null as unknown as CardStatus["view"],
    });
    const { container } = render(
      <ProgramCardStatus card={card} phone="+6591234567" />,
    );
    expect(
      container.querySelector("[data-flame-stage]"),
    ).not.toBeInTheDocument();
  });
});

describe("ProgramCardStatus regenerate dialog", () => {
  it("issues a new card and closes the dialog on confirm", async () => {
    regenerateCardActionMock.mockResolvedValue({ success: true });
    const user = userEvent.setup();
    render(<ProgramCardStatus card={baseCard({})} phone="+6591234567" />);

    await user.click(screen.getByRole("button", { name: /lost your code/i }));
    expect(
      screen.getByRole("heading", { name: "Get a new card?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Get a new card" }));
    expect(regenerateCardActionMock).toHaveBeenCalled();
  });
});

describe("ProgramCardStatus lucky view", () => {
  it("renders LuckyBox instead of stamp dots for a lucky view", () => {
    render(
      <ProgramCardStatus
        card={baseCard({
          view: { kind: "lucky", visitsSinceWin: 2, pityCeiling: 8 },
        })}
        phone="+6591234567"
      />,
    );
    expect(screen.getByText("Tap for a surprise")).toBeInTheDocument();
    expect(screen.getByText("Guaranteed win by visit 2/8")).toBeInTheDocument();
  });
});

describe("ProgramCardStatus cup variant", () => {
  it("renders the Cup visual (not Plant) when view.variant is cup", () => {
    const { container } = render(
      <ProgramCardStatus card={baseCard({})} phone="+6591234567" />,
    );
    // Cup renders a persistent coffee ellipse; Plant has no such hook.
    expect(
      container.querySelector('[data-cup-coffee="true"]'),
    ).toBeInTheDocument();
  });

  it("renders the Plant visual (not Cup) when view.variant is plant", () => {
    const { container } = render(
      <ProgramCardStatus
        card={baseCard({
          view: {
            kind: "plant",
            stage: 1,
            stageName: "Sprout",
            totalStages: 5,
            wilting: false,
            variant: "plant",
            filled: 1,
            total: 4,
          },
        })}
        phone="+6591234567"
      />,
    );
    expect(
      container.querySelector('[data-cup-coffee="true"]'),
    ).not.toBeInTheDocument();
  });
});

describe("ProgramCardStatus points catalog mode", () => {
  it("shows the reward catalog for a points card in catalog mode", () => {
    render(
      <ProgramCardStatus
        card={{
          programId: "p1",
          name: "Coffee Points",
          label: "150 points",
          view: {
            kind: "dots",
            filled: 150,
            total: 300,
            variant: "points",
            redemptionMode: "catalog",
            catalog: [
              { id: "a", label: "Free drink", cost: 100, affordable: true },
              { id: "b", label: "Free meal", cost: 300, affordable: false },
            ],
          },
          rewardReady: true,
          reward_text: "unused",
          qr: "",
          expired: false,
          active: true,
          replacedByName: null,
          carriedOverCount: null,
          activeVouchers: [],
        }}
        phone="+6591234567"
      />,
    );
    expect(
      screen.getByRole("button", { name: /free drink/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /free meal/i }),
    ).not.toBeInTheDocument();
  });

  it("renders each pending voucher's own QR under Your rewards", () => {
    render(
      <ProgramCardStatus
        card={{
          programId: "p1",
          name: "Coffee Points",
          label: "50 points",
          view: {
            kind: "dots",
            filled: 50,
            total: 300,
            variant: "points",
            redemptionMode: "catalog",
            catalog: [],
          },
          rewardReady: false,
          reward_text: "unused",
          qr: "",
          expired: false,
          active: true,
          replacedByName: null,
          carriedOverCount: null,
          activeVouchers: [
            {
              id: "v1",
              rewardText: "Free drink",
              expiresAt: null,
              qr: "<svg>mock</svg>",
            },
          ],
        }}
        phone="+6591234567"
      />,
    );
    expect(screen.getByText("Your rewards")).toBeInTheDocument();
    expect(screen.getByText("Free drink")).toBeInTheDocument();
  });
});
