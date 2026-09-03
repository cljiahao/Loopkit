// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ScratchCard } from "./scratch-card";

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

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

  it("plays a shine sweep once revealed (caller-managed reveal)", () => {
    render(
      <ScratchCard
        revealed={true}
        scratching={false}
        label="Free kopi"
        reward={true}
      />,
    );
    expect(screen.getByTestId("scratch-reveal-shine")).toBeInTheDocument();
  });

  it("renders no shine sweep before reveal", () => {
    render(<ScratchCard revealed={false} label="Try again" reward={false} />);
    expect(
      screen.queryByTestId("scratch-reveal-shine"),
    ).not.toBeInTheDocument();
  });

  // The real customer card (`ProgramCardStatus`) mounts `ScratchCard` with
  // `revealed` already true — the result is decided server-side before the
  // page ever loads — and passes no `scratching` prop at all, since nothing
  // else would ever drive one through a scratching phase. Leaving
  // `scratching` unset is what used to make the card snap straight to the
  // revealed state with no scratch animation ever playing; these cases lock
  // in the fix.
  describe("auto-managed reveal (scratching left unset)", () => {
    beforeEach(() => {
      mockMatchMedia(false);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("starts covered and plays its own scratch-in before revealing", () => {
      render(<ScratchCard revealed={true} label="Free kopi" reward={true} />);
      expect(screen.getByTestId("scratch-overlay")).toBeInTheDocument();
      expect(
        screen.queryByTestId("scratch-reveal-shine"),
      ).not.toBeInTheDocument();
      const paths = screen.getAllByTestId("scratch-path");
      paths.forEach((p) => {
        expect(p.getAttribute("class")).toContain("scratch-draw-in");
      });

      act(() => {
        vi.advanceTimersByTime(1150);
      });

      expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
      expect(screen.getByTestId("scratch-reveal-shine")).toBeInTheDocument();
    });

    it("skips straight to revealed under reduced motion", () => {
      mockMatchMedia(true);
      render(<ScratchCard revealed={true} label="Free kopi" reward={true} />);
      expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
      expect(screen.getByTestId("scratch-reveal-shine")).toBeInTheDocument();
    });

    it("mounts the real drag-to-scratch canvas as a progressive enhancement over the SVG fallback", () => {
      render(<ScratchCard revealed={true} label="Free kopi" reward={true} />);
      // jsdom has no 2D canvas context, so the canvas stays present but
      // hidden and the SVG strokes above do the actual reveal — this only
      // asserts the canvas is attempted at all for the real customer card.
      expect(screen.getByTestId("scratch-canvas")).toBeInTheDocument();
    });

    it("never mounts the canvas under reduced motion (reveal is instant, nothing to drag)", () => {
      mockMatchMedia(true);
      render(<ScratchCard revealed={true} label="Free kopi" reward={true} />);
      expect(screen.queryByTestId("scratch-canvas")).not.toBeInTheDocument();
    });
  });

  it("never mounts the canvas for a caller-managed reveal (the setup preview runs its own timeline)", () => {
    render(
      <ScratchCard
        revealed={false}
        scratching={false}
        label="Try again"
        reward={false}
      />,
    );
    expect(screen.queryByTestId("scratch-canvas")).not.toBeInTheDocument();
  });

  describe("coverStyle", () => {
    it("defaults to the foil cover copy", () => {
      render(<ScratchCard revealed={false} label="Try again" reward={false} />);
      expect(screen.getByText("Scratch to reveal")).toBeInTheDocument();
    });

    it("renders the wax panel's own cover copy", () => {
      render(
        <ScratchCard
          revealed={false}
          label="Try again"
          reward={false}
          coverStyle="wax"
        />,
      );
      expect(screen.getByText("Scratch to reveal")).toBeInTheDocument();
    });

    it("renders the ticket stub's own cover copy", () => {
      render(
        <ScratchCard
          revealed={false}
          label="Try again"
          reward={false}
          coverStyle="ticket"
        />,
      );
      expect(screen.getByText("SCRATCH & WIN")).toBeInTheDocument();
    });
  });
});
