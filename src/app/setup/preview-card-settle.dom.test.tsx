// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewCard } from "./preview-card";
import type { Progress } from "@/lib/engine/types";
const { callbacks } = vi.hoisted(() => ({
  callbacks: { settled: undefined as (() => void) | undefined },
}));
vi.mock("@/components/wheel", () => ({
  Wheel: ({ onSettled }: { onSettled?: () => void }) => {
    callbacks.settled = onSettled;
    return <div>Wheel</div>;
  },
}));
vi.mock("@/components/card-burst", () => ({
  CardBurst: ({ active }: { active: boolean }) => (
    <div data-testid="burst" data-active={String(active)} />
  ),
}));
describe("preview wheel settle", () => {
  it("waits for each spin to settle before celebrating", () => {
    const progress: Progress = {
      stage: "collecting",
      label: "Spin",
      rewardReady: false,
      view: {
        kind: "chance",
        variant: "wheel",
        segments: [],
        landedId: null,
      },
    };
    const props = {
      progress,
      name: "Wheel",
      rewardText: "Prize",
      celebrating: true,
    };
    const { rerender } = render(<PreviewCard {...props} />);
    expect(screen.getByTestId("burst")).toHaveAttribute("data-active", "true");
    rerender(<PreviewCard {...props} revealing />);
    expect(screen.getByTestId("burst")).toHaveAttribute("data-active", "false");
    act(() => callbacks.settled?.());
    expect(screen.getByTestId("burst")).toHaveAttribute("data-active", "true");
    rerender(<PreviewCard {...props} />);
    rerender(<PreviewCard {...props} revealing />);
    expect(screen.getByTestId("burst")).toHaveAttribute("data-active", "false");
  });
});
