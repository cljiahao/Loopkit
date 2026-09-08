// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Briefing } from "./briefing";

describe("Briefing", () => {
  it("renders the full sentence and pulls out a leading number", () => {
    const { container } = render(
      <Briefing text="41 regulars kept coming back this month." />,
    );
    expect(container.textContent).toContain(
      "41 regulars kept coming back this month.",
    );
    expect(screen.getByText("41")).toHaveClass("font-mono");
  });

  it("renders a non-numeric lead as plain text", () => {
    const { container } = render(
      <Briefing text="No regulars yet this month." />,
    );
    expect(container.textContent).toBe("No regulars yet this month.");
  });

  it("renders a single-word text with no leading-number split", () => {
    const { container } = render(<Briefing text="Welcome." />);
    expect(container.textContent).toBe("Welcome.");
  });

  it("has no em dash", () => {
    const { container } = render(<Briefing text="3 regulars this month." />);
    expect(container.textContent).not.toContain("—");
  });
});
