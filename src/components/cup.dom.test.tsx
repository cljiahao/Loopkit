// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Cup } from "@/components/cup";

describe("Cup", () => {
  it("renders an svg", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders no visible coffee at stage 0 (Empty)", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    const coffee = container.querySelector('[data-cup-coffee="true"]');
    expect(coffee).toBeInTheDocument();
    expect(coffee?.getAttribute("rx")).toBe("0");
    expect(coffee?.getAttribute("ry")).toBe("0");
  });

  it("grows the coffee ellipse once past Empty", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    const coffee = container.querySelector('[data-cup-coffee="true"]');
    expect(Number(coffee?.getAttribute("rx"))).toBeGreaterThan(0);
    expect(Number(coffee?.getAttribute("ry"))).toBeGreaterThan(0);
  });

  it("always sets an explicit cx on the coffee ellipse (never defaults to 0)", () => {
    const { container } = render(
      <Cup stage={3} totalStages={5} wilting={false} />,
    );
    const coffee = container.querySelector('[data-cup-coffee="true"]');
    expect(coffee?.getAttribute("cx")).toBe("50");
  });

  it("renders the pedestal foot and saucer for depth, present even when empty", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelectorAll("ellipse").length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("shows the latte-art tulip only at the Full stage", () => {
    const notFull = render(<Cup stage={3} totalStages={5} wilting={false} />);
    expect(
      notFull.container.querySelector('[data-cup-tulip="true"]'),
    ).not.toBeInTheDocument();

    const full = render(<Cup stage={4} totalStages={5} wilting={false} />);
    expect(
      full.container.querySelector('[data-cup-tulip="true"]'),
    ).toBeInTheDocument();
  });

  it("uses the slow shared growth duration on the coffee ellipse", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    const coffee = container.querySelector('[data-cup-coffee="true"]');
    expect(coffee?.getAttribute("class")).toContain("duration-[1600ms]");
  });

  it("shifts the coffee gradient's tone across fill stages (fixed coffee palette, not brand color)", () => {
    const sip = render(<Cup stage={1} totalStages={5} wilting={false} />);
    const full = render(<Cup stage={4} totalStages={5} wilting={false} />);
    const sipStop = sip.container.querySelector('[data-cup-coffee-stop="hi"]');
    const fullStop = full.container.querySelector(
      '[data-cup-coffee-stop="hi"]',
    );
    expect(sipStop?.getAttribute("stop-color")).not.toBe("");
    expect(sipStop?.getAttribute("stop-color")).not.toBe(
      fullStop?.getAttribute("stop-color"),
    );
  });

  it("dims the coffee gradient stops to the muted-foreground color when wilting", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={true} />,
    );
    const stops = container.querySelectorAll("[data-cup-coffee-stop]");
    expect(stops.length).toBeGreaterThan(0);
    stops.forEach((stop) => {
      expect(stop.getAttribute("stop-color")).toBe(
        "var(--color-muted-foreground)",
      );
    });
  });

  it("fades and scales the tulip flourish in on mount instead of popping", () => {
    const { container } = render(
      <Cup stage={4} totalStages={5} wilting={false} />,
    );
    const tulip = container.querySelector('[data-cup-tulip="true"]');
    const animated = tulip?.querySelector("g");
    expect(animated?.getAttribute("class")).toContain("starting:opacity-0");
    expect(animated?.getAttribute("class")).toContain("starting:scale-0");
  });
});
