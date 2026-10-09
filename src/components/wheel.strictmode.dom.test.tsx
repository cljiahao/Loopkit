// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Wheel } from "./wheel";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("settles once after StrictMode cancels the initial frame", () => {
  let now = 0;
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.spyOn(performance, "now").mockImplementation(() => now);
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  const settled = vi.fn();
  render(
    <StrictMode>
      <Wheel
        segments={[
          { id: "lose", label: "Again", reward: false },
          { id: "win", label: "Coffee", reward: true },
        ]}
        landedId="win"
        onSettled={settled}
      />
    </StrictMode>,
  );
  act(() => {
    now = 10000;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  });
  expect(settled).toHaveBeenCalledTimes(1);
  expect(settled).toHaveBeenCalledWith({ won: true });
});
