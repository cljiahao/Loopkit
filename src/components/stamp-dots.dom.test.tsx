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

  it("applies a custom color to a filled dots-style slot", () => {
    const { container } = render(
      <StampDots filled={2} total={5} color="#8a2436" />,
    );
    const spans = container.querySelectorAll("div > span");
    // jsdom normalizes an inline `background: #hex` to `rgb(...)`.
    expect(spans[0].getAttribute("style")).toContain("rgb(138, 36, 54)");
  });

  it("leaves the reward slot's own gold styling untouched by a custom color, even in dots style", () => {
    const { container } = render(
      <StampDots filled={5} total={5} color="#8a2436" />,
    );
    const spans = container.querySelectorAll("div > span");
    const reward = spans[spans.length - 1];
    expect(reward.getAttribute("style")).toBeFalsy();
    expect(reward.getAttribute("class")).toContain("border-gold");
  });
});

describe("StampDots style", () => {
  (["seal", "ink", "punch", "charm"] as const).forEach((styleKind) => {
    it(`renders ${styleKind} style with one slot per total`, () => {
      const { container } = render(
        <StampDots filled={2} total={5} style={styleKind} />,
      );
      expect(container.querySelectorAll("div > span")).toHaveLength(5);
    });

    it(`${styleKind} style's reward slot ignores a custom color`, () => {
      const { container } = render(
        <StampDots filled={5} total={5} style={styleKind} color="#8a2436" />,
      );
      const outer = container.querySelectorAll("div > span");
      const rewardInner = outer[outer.length - 1].querySelector("span");
      const styleAttr = rewardInner?.getAttribute("style") ?? "";
      expect(styleAttr).not.toContain("rgb(138, 36, 54)");
    });

    it(`${styleKind} style still shows a Check on a filled slot with no mark`, () => {
      const { container } = render(
        <StampDots filled={2} total={5} style={styleKind} />,
      );
      const outer = container.querySelectorAll("div > span");
      expect(outer[0].querySelector("svg")).toBeInTheDocument();
    });
  });

  it("applies a custom color to a filled seal slot's gradient", () => {
    const { container } = render(
      <StampDots filled={2} total={5} style="seal" color="#8a2436" />,
    );
    const outer = container.querySelectorAll("div > span");
    const inner = outer[0].querySelector("span");
    expect(inner?.getAttribute("style")).toContain("rgb(138, 36, 54)");
  });

  it("still resolves a photo mark inside a non-dots style", () => {
    const { container } = render(
      <StampDots
        filled={2}
        total={5}
        style="punch"
        mark={{ kind: "photo", url: "https://example.test/vendor.webp" }}
      />,
    );
    expect(container.querySelectorAll("img")).toHaveLength(4);
  });
});
