// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StampCard } from "./stamp-card";

describe("StampCard", () => {
  it("renders 8 dots: 6 stamped (last one animated), 1 unstamped, 1 reward", () => {
    const { container } = render(<StampCard />);
    const dots = container.querySelectorAll(".rounded-full");
    expect(dots).toHaveLength(8);

    // Stamped dots (0-5) show a check icon; the last stamped dot (index 5)
    // carries the "just stamped" pop animation and delay.
    for (let i = 0; i < 6; i++) {
      expect(dots[i].querySelector("svg")).toBeInTheDocument();
    }
    expect(dots[5]).toHaveClass("motion-safe:animate-stamp-pop");
    expect(dots[5]).toHaveStyle({ animationDelay: "0.5s" });

    // Unstamped dot (index 6) shows its number, not an icon.
    expect(dots[6]).toHaveTextContent("7");
    expect(dots[6]).not.toHaveClass("motion-safe:animate-stamp-pop");

    // Reward dot (index 7, last) shows a gift icon and the gold border class.
    expect(dots[7]).toHaveClass("border-gold");
    expect(dots[7].querySelector("svg")).toBeInTheDocument();
  });
});
