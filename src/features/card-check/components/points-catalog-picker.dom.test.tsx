// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));
vi.mock("../api/actions", () => ({ selectPointsRewardAction: selectMock }));

import { PointsCatalogPicker } from "./points-catalog-picker";

const items = [
  { id: "a", label: "Free drink", cost: 100 },
  { id: "b", label: "Free meal", cost: 300 },
];

describe("PointsCatalogPicker", () => {
  it("renders nothing when no items are affordable", () => {
    const { container } = render(
      <PointsCatalogPicker
        programId="p1"
        phone="+6591234567"
        items={[]}
        onSelected={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms and reports the new voucher on success", async () => {
    selectMock.mockResolvedValue({
      success: true,
      id: "v1",
      phone: "+6591234567",
      rewardText: "Free drink",
      qr: "<svg>mock</svg>",
    });
    const onSelected = vi.fn();
    const user = userEvent.setup();
    render(
      <PointsCatalogPicker
        programId="p1"
        phone="+6591234567"
        items={items}
        onSelected={onSelected}
      />,
    );
    await user.click(screen.getByRole("button", { name: /free drink/i }));
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(selectMock).toHaveBeenCalled();
    expect(onSelected).toHaveBeenCalledWith({
      id: "v1",
      rewardText: "Free drink",
      qr: "<svg>mock</svg>",
    });
  });
});
