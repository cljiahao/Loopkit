// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScratchCard } from "./scratch-card";

describe("ScratchCard", () => {
  it("shows the cover text and the prize label underneath", () => {
    render(<ScratchCard revealed={false} label="Free kopi" reward={true} />);
    expect(screen.getByText("Scratch to reveal")).toBeInTheDocument();
    expect(screen.getByText("Free kopi")).toBeInTheDocument();
  });

  it("renders 3 overlapping scratch strokes, fully undrawn by default", () => {
    render(<ScratchCard revealed={false} label="Try again" reward={false} />);
    const paths = screen.getAllByTestId("scratch-path");
    expect(paths).toHaveLength(3);
    paths.forEach((p) => {
      expect(p.getAttribute("class")).toContain("[stroke-dashoffset:100]");
      expect(p.getAttribute("class")).not.toContain("scratch-draw-in");
    });
  });

  it("draws all 3 strokes in (via a replayable keyframe animation, not a transition) while scratching", () => {
    render(
      <ScratchCard
        revealed={false}
        scratching
        label="Try again"
        reward={false}
      />,
    );
    const paths = screen.getAllByTestId("scratch-path");
    expect(paths).toHaveLength(3);
    // A CSS `animation` (not `transition`) is what makes this reliably
    // replay every cycle on a freshly mounted node — see scratch-card.tsx
    // and globals.css's `.scratch-draw-in` comment for why a `transition`
    // silently stopped animating after the first cycle.
    paths.forEach((p) => {
      expect(p.getAttribute("class")).toContain("scratch-draw-in");
    });
  });

  it("staggers each stroke's draw-in so they don't all animate in lockstep", () => {
    render(
      <ScratchCard
        revealed={false}
        scratching
        label="Try again"
        reward={false}
      />,
    );
    const paths = screen.getAllByTestId("scratch-path");
    const delays = paths.map((p) => p.style.animationDelay);
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it("removes the scratch overlay once revealed", () => {
    render(
      <ScratchCard
        revealed={true}
        scratching={false}
        label="Free kopi"
        reward={true}
      />,
    );
    expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
  });

  it("removes the scratch overlay when both revealed and scratching are true", () => {
    render(
      <ScratchCard
        revealed={true}
        scratching={true}
        label="Free kopi"
        reward={true}
      />,
    );
    expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
  });

  it("plays a shine sweep once revealed", () => {
    render(<ScratchCard revealed={true} label="Free kopi" reward={true} />);
    expect(screen.getByTestId("scratch-reveal-shine")).toBeInTheDocument();
  });

  it("renders no shine sweep before reveal", () => {
    render(<ScratchCard revealed={false} label="Try again" reward={false} />);
    expect(
      screen.queryByTestId("scratch-reveal-shine"),
    ).not.toBeInTheDocument();
  });
});
