// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StampDots } from "@/components/stamp-dots";

describe("StampDots", () => {
  it("renders total dots, with the last one always a reward slot", () => {
    const { container } = render(<StampDots filled={2} total={5} />);
    expect(container.querySelectorAll("div > span")).toHaveLength(5);
  });

  it("falls back to plain dots (Check on filled, nothing on unfilled) with no mark prop", () => {
    const { container } = render(<StampDots filled={2} total={5} />);
    // Reward slot's Gift + 2 filled Check icons = 3 svgs; unfilled
    // non-reward slots render nothing.
    expect(container.querySelectorAll("svg")).toHaveLength(3);
  });

  it("renders the chosen preset icon on every non-reward stamp, faded/greyscale on unfilled", () => {
    const { container } = render(
      <StampDots
        filled={2}
        total={5}
        mark={{ kind: "preset", key: "coffee" }}
      />,
    );
    const spans = container.querySelectorAll("div > span");
    const nonRewardIcons = Array.from(spans)
      .slice(0, 4)
      .map((s) => s.querySelector("svg"));
    expect(nonRewardIcons.every(Boolean)).toBe(true);
    expect(nonRewardIcons[0]?.getAttribute("class")).not.toContain(
      "opacity-40",
    );
    expect(nonRewardIcons[2]?.getAttribute("class")).toContain("opacity-40");
    expect(nonRewardIcons[2]?.getAttribute("class")).toContain("grayscale");
  });

  it("renders a photo mark for filled stamps and a faded version for unfilled", () => {
    const { container } = render(
      <StampDots
        filled={2}
        total={5}
        mark={{ kind: "photo", url: "https://example.test/vendor.webp" }}
      />,
    );
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(4);
    expect(images[0].getAttribute("class")).not.toContain("opacity-40");
    expect(images[2].getAttribute("class")).toContain("opacity-40");
    expect(images[2].getAttribute("class")).toContain("grayscale");
  });

  it("always renders the reward slot's own Gift icon regardless of mark", () => {
    const { container } = render(
      <StampDots filled={5} total={5} mark={{ kind: "preset", key: "star" }} />,
    );
    const spans = container.querySelectorAll("div > span");
    const rewardIcon = spans[spans.length - 1].querySelector("svg");
    expect(rewardIcon).toBeInTheDocument();
  });
});
