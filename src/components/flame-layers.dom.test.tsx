// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlameLayers } from "@/components/flame-layers";

describe("FlameLayers", () => {
  it("renders the Spark stage label and count", () => {
    render(<FlameLayers filled={2} total={8} stage={0} stageName="Spark" />);
    expect(screen.getByText("Spark — 2/8")).toBeInTheDocument();
  });

  it("renders the Inner Flame stage label and count", () => {
    render(
      <FlameLayers filled={4} total={8} stage={1} stageName="Inner Flame" />,
    );
    expect(screen.getByText("Inner Flame — 4/8")).toBeInTheDocument();
  });

  it("renders the Full Blaze stage label and count", () => {
    render(
      <FlameLayers filled={8} total={8} stage={2} stageName="Full Blaze" />,
    );
    expect(screen.getByText("Full Blaze — 8/8")).toBeInTheDocument();
  });

  it("renders two flame icons (inner + outer layers)", () => {
    const { container } = render(
      <FlameLayers filled={8} total={8} stage={2} stageName="Full Blaze" />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });
});
