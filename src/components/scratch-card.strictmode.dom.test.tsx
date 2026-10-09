// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScratchCard } from "./scratch-card";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("reveals the prize after StrictMode restarts the timer effect", async () => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  render(
    <StrictMode>
      <ScratchCard revealed label="Free coffee" reward />
    </StrictMode>,
  );
  expect(screen.getByTestId("scratch-overlay")).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(1200);
  });
  expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
  expect(screen.getByTestId("scratch-reveal-shine")).toBeInTheDocument();
});
