// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ColorPicker } from "./color-picker";

describe("ColorPicker", () => {
  it("renders a swatch trigger showing the current color", () => {
    render(
      <ColorPicker
        value="#3b82f6"
        onChange={vi.fn()}
        label="Segment 1 color"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Segment 1 color" });
    expect(trigger).toHaveStyle({ backgroundColor: "#3b82f6" });
  });

  it("uses the label as the trigger's accessible name", () => {
    render(
      <ColorPicker
        value="#fb7185"
        onChange={vi.fn()}
        label="Free item color"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Free item color" }),
    ).toBeInTheDocument();
  });
});
