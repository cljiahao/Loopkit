// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RewardCelebration } from "@/components/reward-celebration";

describe("RewardCelebration", () => {
  it("renders a card-burst overlay contained in the dialog when open", async () => {
    render(
      <RewardCelebration
        open={true}
        phone="+65 9123 4567"
        rewardText="Free kopi"
        onOpenChange={() => {}}
      />,
    );
    // AlertDialog content is portal-rendered to document.body — query via
    // screen, not the local render() container.
    expect(await screen.findByText("🎉 Reward unlocked!")).toBeInTheDocument();
    expect(
      document.querySelectorAll(".card-burst-piece").length,
    ).toBeGreaterThan(0);
  });

  it("renders no dialog content when closed", () => {
    render(
      <RewardCelebration
        open={false}
        phone="+65 9123 4567"
        rewardText="Free kopi"
        onOpenChange={() => {}}
      />,
    );
    expect(screen.queryByText("🎉 Reward unlocked!")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".card-burst-piece")).toHaveLength(0);
  });
});
