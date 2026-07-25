// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Wheel } from "./wheel";

const SEGMENTS = [
  { id: "a", label: "Try again", reward: false },
  { id: "b", label: "Free item", reward: true },
];

/**
 * A controllable requestAnimationFrame stub: queues callbacks and lets the
 * test advance a fake clock and flush frames deterministically, instead of
 * relying on real timing (which would make physics-accuracy assertions
 * flaky). `performance.now()` is mocked to track the same fake clock.
 */
function mockRaf() {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    queue.push(cb);
    return queue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => now);
  return {
    advance(ms: number) {
      now += ms;
      act(() => {
        const pending = queue;
        queue = [];
        pending.forEach((cb) => cb(now));
      });
    },
  };
}

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("Wheel", () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts at rest (0deg) when not spinning and no result yet", () => {
    mockRaf();
    render(<Wheel segments={SEGMENTS} landedId={null} />);
    const rotor = screen.getByTestId("wheel-rotor");
    expect(rotor.getAttribute("style")).toContain("rotate(0deg)");
  });

  it("continuously decelerates during the free-spin phase, never resetting to a flat constant speed", () => {
    const raf = mockRaf();
    render(<Wheel segments={SEGMENTS} landedId={null} spinning />);
    const rotor = screen.getByTestId("wheel-rotor");

    const readAngle = () => {
      const m = /rotate\(([-\d.]+)deg\)/.exec(
        rotor.getAttribute("style") ?? "",
      );
      return m ? parseFloat(m[1]) : NaN;
    };

    raf.advance(100);
    const a1 = readAngle();
    raf.advance(100);
    const a2 = readAngle();
    raf.advance(100);
    const a3 = readAngle();

    const v1 = a2 - a1; // deg covered in the 2nd 100ms window
    const v2 = a3 - a2; // deg covered in the 3rd 100ms window
    // Real (non-flat) deceleration: each successive equal-time window
    // covers strictly less distance than the one before it.
    expect(v2).toBeLessThan(v1);
    expect(a1).toBeGreaterThan(0);
  });

  it("lands exactly on the winning segment's angle once resolved, continuing forward without resetting", () => {
    const raf = mockRaf();
    const { rerender } = render(
      <Wheel segments={SEGMENTS} landedId={null} spinning />,
    );
    raf.advance(1400); // run out the full free-spin window

    rerender(<Wheel segments={SEGMENTS} landedId="b" spinning={false} />);
    // flush the settle animation to completion (well past any plausible t2)
    for (let i = 0; i < 50; i++) raf.advance(200);

    const rotor = screen.getByTestId("wheel-rotor");
    const m = /rotate\(([-\d.]+)deg\)/.exec(rotor.getAttribute("style") ?? "");
    const finalAngle = m ? parseFloat(m[1]) : NaN;
    // Segment "b" (index 1 of 2, 180deg each) should land under the fixed
    // top pointer: expected mod-360 target is 360 - (1*180 + 90) = 90.
    expect(((finalAngle % 360) + 360) % 360).toBeCloseTo(90, 0);
  });

  it("jumps straight to the resolved angle with no animation under reduced motion", () => {
    mockMatchMedia(true);
    const raf = mockRaf();
    render(<Wheel segments={SEGMENTS} landedId="b" />);
    raf.advance(0);
    const rotor = screen.getByTestId("wheel-rotor");
    const m = /rotate\(([-\d.]+)deg\)/.exec(rotor.getAttribute("style") ?? "");
    const angle = m ? parseFloat(m[1]) : NaN;
    expect(((angle % 360) + 360) % 360).toBeCloseTo(90, 0);
  });

  it("renders reward segments and non-reward segments with visibly distinct colors", () => {
    mockRaf();
    const { container } = render(<Wheel segments={SEGMENTS} landedId={null} />);
    const paths = container.querySelectorAll("path");
    expect(paths[0].getAttribute("class")).toContain("fill-rose");
    expect(paths[1].getAttribute("class")).toContain("fill-emerald");
  });

  it("uses a vendor-picked segment color when set, instead of the reward/non-reward default", () => {
    mockRaf();
    const customSegments = [
      { id: "a", label: "Try again", reward: false, color: "#3b82f6" },
      { id: "b", label: "Free item", reward: true },
    ];
    const { container } = render(
      <Wheel segments={customSegments} landedId={null} />,
    );
    const paths = container.querySelectorAll("path");
    expect(paths[0].getAttribute("fill")).toBe("#3b82f6");
    expect(paths[0].getAttribute("class") ?? "").not.toContain("fill-rose");
    // Segment b has no custom color — still falls back to the default.
    expect(paths[1].getAttribute("class")).toContain("fill-emerald");
  });
});
