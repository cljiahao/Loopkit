// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScratchCard } from "./scratch-card";

describe("ScratchCard", () => {
  it("shows the cover text and the prize label underneath", () => {
    render(<ScratchCard revealed={false} label="Free kopi" reward={true} />);
    expect(screen.getByText("Scratch to reveal")).toBeInTheDocument();
    expect(screen.getByText("Free kopi")).toBeInTheDocument();
  });

  it("renders the scratch reveal path fully undrawn by default", () => {
    render(<ScratchCard revealed={false} label="Try again" reward={false} />);
    const path = screen.getByTestId("scratch-path");
    expect(path.getAttribute("class")).toContain("[stroke-dashoffset:100]");
  });

  it("draws the scratch reveal path in while scratching", () => {
    render(
      <ScratchCard
        revealed={false}
        scratching
        label="Try again"
        reward={false}
      />,
    );
    const path = screen.getByTestId("scratch-path");
    expect(path.getAttribute("class")).toContain("[stroke-dashoffset:0]");
  });

  it("removes the scratch overlay once revealed", () => {
    render(
      <ScratchCard
        revealed={true}
        scratching={false}
        label="Free kopi"
        reward={true}
      />,
    );
    expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
  });

  it("removes the scratch overlay when both revealed and scratching are true", () => {
    render(
      <ScratchCard
        revealed={true}
        scratching={true}
        label="Free kopi"
        reward={true}
      />,
    );
    expect(screen.queryByTestId("scratch-overlay")).not.toBeInTheDocument();
  });

  it("plays a shine sweep once revealed", () => {
    render(<ScratchCard revealed={true} label="Free kopi" reward={true} />);
    expect(screen.getByTestId("scratch-reveal-shine")).toBeInTheDocument();
  });

  it("renders no shine sweep before reveal", () => {
    render(<ScratchCard revealed={false} label="Try again" reward={false} />);
    expect(
      screen.queryByTestId("scratch-reveal-shine"),
    ).not.toBeInTheDocument();
  });
});
