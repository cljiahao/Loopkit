// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from "./reduced-motion";
afterEach(() => vi.unstubAllGlobals());
describe("reduced motion snapshot", () => {
  it("falls back outside a browser", () => {
    vi.stubGlobal("window", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
  it("falls back without matchMedia", () => {
    vi.stubGlobal("window", {});
    expect(prefersReducedMotion()).toBe(false);
  });
  it.each([false, true])("reads the current preference %s", (matches) => {
    const matchMedia = vi.fn(() => ({ matches }));
    vi.stubGlobal("window", { matchMedia });
    expect(prefersReducedMotion()).toBe(matches);
    expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
  });
});
