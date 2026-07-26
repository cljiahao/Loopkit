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

  it("renders no liquid at stage 0 (Empty)", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    expect(
      container.querySelector('[data-cup-liquid="body"]'),
    ).not.toBeInTheDocument();
  });

  it("renders a liquid body + surface once growth has started", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    expect(
      container.querySelector('[data-cup-liquid="body"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-cup-liquid="surface"]'),
    ).toBeInTheDocument();
  });

  it("always sets an explicit cx on the liquid surface ellipse (never defaults to 0)", () => {
    const { container } = render(
      <Cup stage={3} totalStages={5} wilting={false} />,
    );
    const surface = container.querySelector('[data-cup-liquid="surface"]');
    expect(surface?.getAttribute("cx")).toBe("50");
  });

  it("draws the mug body as a single continuous outline path, not a separate rim ellipse", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    const strokedPaths = Array.from(container.querySelectorAll("path")).filter(
      (p) =>
        p.getAttribute("stroke") === "currentColor" &&
        p.getAttribute("fill") === "none",
    );
    // Body outline + handle — exactly 2 stroked, unfilled paths.
    expect(strokedPaths).toHaveLength(2);
  });

  it("renders the pedestal foot and saucer for depth, present even when empty", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelectorAll("ellipse").length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("shows the tulip-pour flourish only at the Full stage", () => {
    const notFull = render(<Cup stage={3} totalStages={5} wilting={false} />);
    expect(
      notFull.container.querySelector("[data-cup-tulip]"),
    ).not.toBeInTheDocument();

    const full = render(<Cup stage={4} totalStages={5} wilting={false} />);
    expect(
      full.container.querySelector("[data-cup-tulip]"),
    ).toBeInTheDocument();
  });

  it("uses the slow shared growth duration on the liquid body", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    const body = container.querySelector('[data-cup-liquid="body"]');
    expect(body?.getAttribute("class")).toContain("duration-[1600ms]");
  });

  it("shifts the liquid color across fill stages (fixed coffee palette, not brand color)", () => {
    const sip = render(<Cup stage={1} totalStages={5} wilting={false} />);
    const full = render(<Cup stage={4} totalStages={5} wilting={false} />);
    const sipBody = sip.container.querySelector(
      '[data-cup-liquid="body"]',
    ) as SVGElement;
    const fullBody = full.container.querySelector(
      '[data-cup-liquid="body"]',
    ) as SVGElement;
    expect(sipBody.style.fill).not.toBe("");
    expect(sipBody.style.fill).not.toBe(fullBody.style.fill);
  });

  it("dims the liquid to the muted-foreground color when wilting", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={true} />,
    );
    const body = container.querySelector(
      '[data-cup-liquid="body"]',
    ) as SVGElement;
    expect(body.style.fill).toContain("var(--color-muted-foreground)");
  });

  it("fades and scales the tulip flourish in on mount instead of popping", () => {
    const { container } = render(
      <Cup stage={4} totalStages={5} wilting={false} />,
    );
    const tulip = container.querySelector("[data-cup-tulip]");
    expect(tulip?.getAttribute("class")).toContain("starting:opacity-0");
    expect(tulip?.getAttribute("class")).toContain("starting:scale-0");
  });
});
