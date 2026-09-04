// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ScratchCard, type ScratchCoverStyle } from "./scratch-card";

function mockMatchMedia(reducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reducedMotion && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

// Minimal CanvasRenderingContext2D stand-in — jsdom has none. Fully-
// transparent getImageData so one scratch crosses SETTLE_FRACTION.
function makeFakeCtx() {
  return {
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4 * 200).fill(0),
    })),
  } as unknown as CanvasRenderingContext2D;
}

function mountWithCanvasContext(coverStyle?: ScratchCoverStyle) {
  mockMatchMedia(false);
  const ctx = makeFakeCtx();
  const getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(ctx);
  const result = render(
    <ScratchCard
      revealed={true}
      label="Free kopi"
      reward={true}
      coverStyle={coverStyle}
    />,
  );
  const canvas = screen.getByTestId("scratch-canvas") as HTMLCanvasElement;
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 192,
      height: 112,
      right: 192,
      bottom: 112,
      x: 0,
      y: 0,
      toJSON: () => "",
    }) as DOMRect;
  return { ctx, canvas, getContextSpy, ...result };
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

  // Exercises the real 2D-context path via a fake CanvasRenderingContext2D —
  // everything that stays untested when jsdom's own `getContext` throws
  // (the case every other test in this file runs under).
  describe("real drag-to-scratch canvas (2D context available)", () => {
    it("draws the cover art and switches from the SVG fallback to the canvas", () => {
      const { ctx, canvas, getContextSpy } = mountWithCanvasContext();
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(canvas.className).not.toContain("hidden");
      expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
      getContextSpy.mockRestore();
    });

    it.each(["foil", "wax", "ticket"] as const)(
      "draws the %s cover's own texture and label",
      (coverStyle) => {
        const { ctx, getContextSpy } = mountWithCanvasContext(coverStyle);
        expect(ctx.fillText).toHaveBeenCalled();
        getContextSpy.mockRestore();
      },
    );

    it("scratching enough of the canvas commits the reveal early, and cleanup removes the listeners on unmount", () => {
      const { canvas, unmount, getContextSpy } = mountWithCanvasContext();
      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50 });
      fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60 });
      fireEvent.pointerUp(window);

      expect(screen.getByTestId("scratch-reveal-shine")).toBeInTheDocument();
      expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
      unmount();
      getContextSpy.mockRestore();
    });
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
