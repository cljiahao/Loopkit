import { describe, expect, it } from "vitest";

import { tourSteps } from "./tour-steps";

describe("tourSteps", () => {
  it("returns 4 steps on desktop, 3 on mobile (consensus: keep it short)", () => {
    expect(tourSteps(false)).toHaveLength(4);
    expect(tourSteps(true)).toHaveLength(3);
  });

  it("anchors every step to a data-tour selector", () => {
    for (const mode of [false, true]) {
      for (const step of tourSteps(mode)) {
        expect(step.element).toMatch(/^\[data-tour="[a-z-]+"\]$/);
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("opens on the shop QR block and ends on the replay button in both modes", () => {
    for (const mode of [false, true]) {
      const steps = tourSteps(mode);
      expect(steps[0].element).toBe('[data-tour="shop-qr"]');
      expect(steps[steps.length - 1].element).toBe('[data-tour="tour-replay"]');
    }
  });

  it("desktop spotlights each nav landmark; mobile spotlights the menu instead", () => {
    const desktop = tourSteps(false).map((s) => s.element);
    expect(desktop).toEqual([
      '[data-tour="shop-qr"]',
      '[data-tour="nav-customers"]',
      '[data-tour="nav-account"]',
      '[data-tour="tour-replay"]',
    ]);

    const mobile = tourSteps(true).map((s) => s.element);
    expect(mobile).toContain('[data-tour="nav-menu"]');
    expect(mobile).not.toContain('[data-tour="nav-customers"]');
  });
});
