// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlameLayers } from "@/components/flame-layers";

describe("FlameLayers", () => {
  it("renders the Ember stage label with no flame icon", () => {
    const { container } = render(
      <FlameLayers filled={0} total={10} stage={0} stageName="Ember" />,
    );
    expect(screen.getByText("Ember — 0/10")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("shows a dim coal dot at the Ember stage", () => {
    const { container } = render(
      <FlameLayers filled={0} total={10} stage={0} stageName="Ember" />,
    );
    expect(container.querySelector("[data-flame-coal]")).toBeInTheDocument();
  });

  it("renders a single low-opacity flame icon at the Spark stage", () => {
    const { container } = render(
      <FlameLayers filled={2} total={10} stage={1} stageName="Spark" />,
    );
    const icons = container.querySelectorAll("svg");
    expect(icons).toHaveLength(1);
    expect(icons[0].getAttribute("class")).toContain("text-amber-400/50");
  });

  it("renders three layered flame icons from Small Fire onward", () => {
    const { container } = render(
      <FlameLayers filled={4} total={10} stage={2} stageName="Small Fire" />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(3);
  });

  it("renders the Medium Fire stage label and count", () => {
    render(
      <FlameLayers filled={7} total={10} stage={3} stageName="Medium Fire" />,
    );
    expect(screen.getByText("Medium Fire — 7/10")).toBeInTheDocument();
  });

  it("renders the Full Campfire stage label, 3 flame icons, and a 3rd log", () => {
    const { container } = render(
      <FlameLayers
        filled={10}
        total={10}
        stage={4}
        stageName="Full Campfire"
      />,
    );
    expect(screen.getByText("Full Campfire — 10/10")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(3);
    expect(container.querySelectorAll("[data-flame-log]")).toHaveLength(3);
  });

  it("shows only 2 logs before the Full Campfire stage", () => {
    const { container } = render(
      <FlameLayers filled={2} total={10} stage={1} stageName="Spark" />,
    );
    expect(container.querySelectorAll("[data-flame-log]")).toHaveLength(2);
  });

  it("grows the flame icon size across stages", () => {
    const small = render(
      <FlameLayers filled={4} total={10} stage={2} stageName="Small Fire" />,
    );
    const big = render(
      <FlameLayers
        filled={10}
        total={10}
        stage={4}
        stageName="Full Campfire"
      />,
    );
    expect(
      small.container.querySelector("svg")?.getAttribute("class"),
    ).toContain("size-8");
    expect(big.container.querySelector("svg")?.getAttribute("class")).toContain(
      "size-14",
    );
  });

  it("gates the flicker animation on motion-safe and only while a flame is lit", () => {
    const ember = render(
      <FlameLayers filled={0} total={10} stage={0} stageName="Ember" />,
    );
    expect(
      ember.container
        .querySelector("[data-flame-stage]")
        ?.querySelector(".motion-safe\\:animate-flame-flicker"),
    ).not.toBeInTheDocument();

    const spark = render(
      <FlameLayers filled={2} total={10} stage={1} stageName="Spark" />,
    );
    expect(
      spark.container.querySelector(".motion-safe\\:animate-flame-flicker"),
    ).toBeInTheDocument();
  });
});
