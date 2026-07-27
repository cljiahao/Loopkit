// src/components/plant.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Plant } from "@/components/plant";

describe("Plant", () => {
  it("renders an svg", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("collapses the stem to zero height and shows the seed dot at Seed (stage 0)", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(0)" });
    const seed = Array.from(container.querySelectorAll("circle")).find((c) =>
      c.getAttribute("class")?.includes("fill-primary/60"),
    );
    expect(seed).toBeInTheDocument();
  });

  it("shoots the stem to half height and shows a pale closed tip nub at Sprout (stage 1), no leaves yet", () => {
    const { container } = render(
      <Plant stage={1} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(0.5)" });
    expect(container.querySelector("[data-plant-tip-nub]")).toBeInTheDocument();
    const leaves = container.querySelectorAll("[data-plant-leaf]");
    expect(leaves).toHaveLength(2);
    expect(
      Array.from(leaves).every((l) =>
        l.getAttribute("class")?.includes("opacity-0"),
      ),
    ).toBe(true);
  });

  it("delays the tip nub's fade-in to match the stem's own grow duration", () => {
    const { container } = render(
      <Plant stage={1} totalStages={5} wilting={false} />,
    );
    const nub = container.querySelector("[data-plant-tip-nub]");
    expect(nub).toHaveStyle({ transitionDelay: "1600ms" });
  });

  it("brings both leaf pairs in together and reaches full stem height at Leafing (stage 2)", () => {
    const { container } = render(
      <Plant stage={2} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(1)" });
    expect(
      container.querySelector("[data-plant-tip-nub]"),
    ).not.toBeInTheDocument();
    const leaves = container.querySelectorAll("[data-plant-leaf]");
    expect(leaves).toHaveLength(2);
    expect(
      Array.from(leaves).every((l) =>
        l.getAttribute("class")?.includes("opacity-100"),
      ),
    ).toBe(true);
  });

  it("keeps stem height and leaf position stable from Leafing into Budding, and adds only a bud", () => {
    const leafing = render(<Plant stage={2} totalStages={5} wilting={false} />);
    const budding = render(<Plant stage={3} totalStages={5} wilting={false} />);

    expect(leafing.container.querySelector("line")).toHaveStyle({
      transform: "scaleY(1)",
    });
    expect(budding.container.querySelector("line")).toHaveStyle({
      transform: "scaleY(1)",
    });

    const leafingLeafD = leafing.container
      .querySelectorAll("[data-plant-leaf]")[0]
      .querySelector("path")
      ?.getAttribute("d");
    const buddingLeafD = budding.container
      .querySelectorAll("[data-plant-leaf]")[0]
      .querySelector("path")
      ?.getAttribute("d");
    expect(leafingLeafD).toBe(buddingLeafD);

    expect(
      leafing.container.querySelector("[data-plant-bud]"),
    ).not.toBeInTheDocument();
    expect(
      budding.container.querySelector("[data-plant-bud]"),
    ).toBeInTheDocument();
  });

  it("renders the bloom only at the final stage, with leaves still visible", () => {
    const notBloom = render(
      <Plant stage={3} totalStages={5} wilting={false} />,
    );
    // Shadow ellipse only — no bloom petals yet (bud is a <circle>, not an
    // <ellipse>, so it doesn't add to this count).
    expect(notBloom.container.querySelectorAll("ellipse")).toHaveLength(1);

    const bloom = render(<Plant stage={4} totalStages={5} wilting={false} />);
    // Shadow ellipse + 6 petal ellipses.
    expect(bloom.container.querySelectorAll("ellipse")).toHaveLength(7);
    const leaves = bloom.container.querySelectorAll("[data-plant-leaf]");
    expect(
      Array.from(leaves).every((l) =>
        l.getAttribute("class")?.includes("opacity-100"),
      ),
    ).toBe(true);
  });

  it("dims the plant color when wilting", () => {
    const { container } = render(
      <Plant stage={2} totalStages={5} wilting={true} />,
    );
    expect(container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-muted-foreground",
    );
  });
});
