// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { applyMock } = vi.hoisted(() => ({ applyMock: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({
  applyPointsOffsetAction: applyMock,
}));

import { PointsOffsetForm } from "./points-offset-form";

describe("PointsOffsetForm", () => {
  it("defaults the input to the full balance and applies on click", async () => {
    applyMock.mockResolvedValue({
      success: true,
      phone: "+6591234567",
      stampCount: 50,
      dollars: 2,
    });
    const onApplied = vi.fn();
    const user = userEvent.setup();
    render(
      <PointsOffsetForm
        card={{ id: "c1", phone: "+6591234567", stamp_count: 250 }}
        onApplied={onApplied}
      />,
    );
    expect(screen.getByLabelText("Points to apply")).toHaveValue(250);
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(applyMock).toHaveBeenCalled();
    expect(onApplied).toHaveBeenCalledWith(
      { id: "c1", phone: "+6591234567", stamp_count: 50 },
      2,
    );
  });

  it("disables Apply above the card's own balance", async () => {
    const user = userEvent.setup();
    render(
      <PointsOffsetForm
        card={{ id: "c1", phone: "+6591234567", stamp_count: 100 }}
        onApplied={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Points to apply");
    await user.clear(input);
    await user.type(input, "150");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });
});
