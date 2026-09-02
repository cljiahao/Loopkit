// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FlameLayers } from "@/components/flame-layers";

const LAYERS = ["ember", "spark", "small", "medium", "large"] as const;

describe("FlameLayers", () => {
  it("carries the data-flame-stage hook on the layout wrapper", () => {
    const { container } = render(<FlameLayers stage={3} />);
    expect(
      container.querySelector('[data-flame-stage="3"]'),
    ).toBeInTheDocument();
  });

  it("renders a single SVG with all 5 stage layers always present", () => {
    const { container } = render(<FlameLayers stage={0} />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    LAYERS.forEach((layer) => {
      expect(
        container.querySelector(`[data-flame-layer="${layer}"]`),
      ).toBeInTheDocument();
    });
  });

  it("scales only the current stage's layer to full size, the rest to 0", () => {
    const { container } = render(<FlameLayers stage={3} />);
    LAYERS.forEach((layer, index) => {
      const el = container.querySelector(`[data-flame-layer="${layer}"]`);
      expect(el).toHaveStyle({
        transform: index === 3 ? "scale(1)" : "scale(0)",
      });
    });
  });

  it("shows the ember coal hook only at the Ember stage", () => {
    const ember = render(<FlameLayers stage={0} />);
    expect(
      ember.container.querySelector("[data-flame-coal]"),
    ).toBeInTheDocument();

    const spark = render(<FlameLayers stage={1} />);
    expect(
      spark.container.querySelector("[data-flame-coal]"),
    ).not.toBeInTheDocument();
  });

  it("always draws exactly 2 crossed logs, at every stage", () => {
    const ember = render(<FlameLayers stage={0} />);
    expect(ember.container.querySelectorAll("[data-flame-log]")).toHaveLength(
      2,
    );

    const full = render(<FlameLayers stage={4} />);
    expect(full.container.querySelectorAll("[data-flame-log]")).toHaveLength(2);
  });

  it("grows a Small/Medium/Large stage change with no delay on the incoming layer, but a delay on the outgoing one", () => {
    const { container } = render(<FlameLayers stage={3} />);
    const incoming = container.querySelector('[data-flame-layer="medium"]');
    const outgoing = container.querySelector('[data-flame-layer="small"]');
    expect(incoming).toHaveStyle({ transitionDelay: "0ms" });
    expect(outgoing).toHaveStyle({ transitionDelay: "300ms" });
  });

  it("uses a plain no-delay crossfade for the Full Campfire -> Ember redemption jump", () => {
    const { container } = render(<FlameLayers stage={0} />);
    const large = container.querySelector('[data-flame-layer="large"]');
    expect(large).toHaveStyle({ transitionDelay: "0ms" });
  });

  it("gates both the idle flame flicker and the stage-transition scale behind motion-safe", () => {
    const { container } = render(<FlameLayers stage={2} />);
    expect(
      container.querySelector(".motion-safe\\:animate-flame-flicker-outer"),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        `[data-flame-layer="small"].motion-safe\\:transition-transform`,
      ),
    ).toBeInTheDocument();
  });
});
