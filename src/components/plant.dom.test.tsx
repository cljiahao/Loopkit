// src/components/plant.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Plant } from "@/components/plant";

function scaleYOf(el: Element | null): number {
  const transform = (el as HTMLElement | null)?.style.transform ?? "";
  const match = /scaleY\(([-\d.]+)\)/.exec(transform);
  return match ? Number(match[1]) : NaN;
}

function leafOpacities(container: HTMLElement): boolean[] {
  return Array.from(container.querySelectorAll("[data-plant-leaf]")).map(
    (l) => l.getAttribute("class")?.includes("opacity-100") ?? false,
  );
}

describe("Plant", () => {
  it("renders an svg", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("grows the stem progressively across stages, and holds at 0 through Seed and Sprout", () => {
    const stage0 = render(<Plant stage={0} totalStages={5} wilting={false} />);
    const stage1 = render(<Plant stage={1} totalStages={5} wilting={false} />);
    const stage2 = render(<Plant stage={2} totalStages={5} wilting={false} />);
    const stage3 = render(<Plant stage={3} totalStages={5} wilting={false} />);
    const stage4 = render(<Plant stage={4} totalStages={5} wilting={false} />);

    const scales = [stage0, stage1, stage2, stage3, stage4].map((r) =>
      scaleYOf(r.container.querySelector("line")),
    );

    expect(scales[0]).toBeCloseTo(0);
    expect(scales[1]).toBeCloseTo(0);
    // Sapling -> Budding -> Blooming each grow the stem further, never back.
    expect(scales[2]).toBeGreaterThan(scales[1]);
    expect(scales[3]).toBeGreaterThan(scales[2]);
    expect(scales[4]).toBeGreaterThan(scales[3]);
  });

  it("shows the seed dot only at Seed (stage 0)", () => {
    const seed = render(<Plant stage={0} totalStages={5} wilting={false} />);
    const sprout = render(<Plant stage={1} totalStages={5} wilting={false} />);

    expect(
      seed.container.querySelector("[data-plant-seed]")?.getAttribute("class"),
    ).toContain("scale-100");
    expect(
      sprout.container
        .querySelector("[data-plant-seed]")
        ?.getAttribute("class"),
    ).toContain("scale-0");
  });

  it("shows the sprout hook only at Sprout (stage 1)", () => {
    const sprout = render(<Plant stage={1} totalStages={5} wilting={false} />);
    const sapling = render(<Plant stage={2} totalStages={5} wilting={false} />);

    expect(
      sprout.container
        .querySelector("[data-plant-hook]")
        ?.getAttribute("class"),
    ).toContain("opacity-100");
    expect(
      sapling.container
        .querySelector("[data-plant-hook]")
        ?.getAttribute("class"),
    ).toContain("opacity-0");
  });

  it("always renders exactly 5 persistent leaf slots, revealing more of them stage by stage", () => {
    const stage1 = render(<Plant stage={1} totalStages={5} wilting={false} />);
    const stage2 = render(<Plant stage={2} totalStages={5} wilting={false} />);
    const stage3 = render(<Plant stage={3} totalStages={5} wilting={false} />);
    const stage4 = render(<Plant stage={4} totalStages={5} wilting={false} />);

    for (const r of [stage1, stage2, stage3, stage4]) {
      expect(r.container.querySelectorAll("[data-plant-leaf]")).toHaveLength(5);
    }

    expect(leafOpacities(stage1.container).filter(Boolean)).toHaveLength(0);
    expect(leafOpacities(stage2.container).filter(Boolean)).toHaveLength(3);
    expect(leafOpacities(stage3.container).filter(Boolean)).toHaveLength(4);
    expect(leafOpacities(stage4.container).filter(Boolean)).toHaveLength(5);
  });

  it("mounts the bud only from Budding (stage 3) onward", () => {
    const sapling = render(<Plant stage={2} totalStages={5} wilting={false} />);
    const budding = render(<Plant stage={3} totalStages={5} wilting={false} />);

    expect(
      sapling.container.querySelector("[data-plant-bud]"),
    ).not.toBeInTheDocument();
    expect(
      budding.container.querySelector("[data-plant-bud]"),
    ).toBeInTheDocument();
    expect(
      budding.container
        .querySelector("[data-plant-bud]")
        ?.getAttribute("class"),
    ).toContain("opacity-100");
  });

  it("delays the bud's fade-out to match the bloom's own grow duration", () => {
    const { container } = render(
      <Plant stage={4} totalStages={5} wilting={false} />,
    );
    const bud = container.querySelector("[data-plant-bud]");
    expect(bud).toBeInTheDocument();
    expect(bud?.getAttribute("class")).toContain("opacity-0");
    expect(bud).toHaveStyle({ transitionDelay: "1600ms" });
  });

  it("renders the bloom only at the final stage, with leaves still visible", () => {
    const notBloom = render(
      <Plant stage={3} totalStages={5} wilting={false} />,
    );
    expect(
      notBloom.container.querySelector("[data-plant-bloom]"),
    ).not.toBeInTheDocument();

    const bloom = render(<Plant stage={4} totalStages={5} wilting={false} />);
    expect(
      bloom.container.querySelector("[data-plant-bloom]"),
    ).toBeInTheDocument();
    expect(leafOpacities(bloom.container).every(Boolean)).toBe(true);
  });

  it("picks the same bloom type for the same seed, consistently across renders", () => {
    const first = render(
      <Plant stage={4} totalStages={5} wilting={false} seed="customer-42" />,
    );
    const second = render(
      <Plant stage={4} totalStages={5} wilting={false} seed="customer-42" />,
    );

    const firstBloom =
      first.container.querySelector("[data-plant-bloom]")?.innerHTML;
    const secondBloom =
      second.container.querySelector("[data-plant-bloom]")?.innerHTML;

    expect(firstBloom).toBeTruthy();
    expect(firstBloom).toBe(secondBloom);
  });

  it("can pick different bloom types for different seeds", () => {
    const seeds = ["a", "bb", "ccc", "dddd", "eeeee", "ffffff", "ggggggg"];
    const shapes = new Set(
      seeds.map((seed) => {
        const { container } = render(
          <Plant stage={4} totalStages={5} wilting={false} seed={seed} />,
        );
        return container.querySelector("[data-plant-bloom]")?.innerHTML;
      }),
    );

    expect(shapes.size).toBeGreaterThanOrEqual(2);
  });

  it("defaults to a stable bloom type when no seed is given", () => {
    const first = render(<Plant stage={4} totalStages={5} wilting={false} />);
    const second = render(<Plant stage={4} totalStages={5} wilting={false} />);

    expect(first.container.querySelector("[data-plant-bloom]")?.innerHTML).toBe(
      second.container.querySelector("[data-plant-bloom]")?.innerHTML,
    );
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
