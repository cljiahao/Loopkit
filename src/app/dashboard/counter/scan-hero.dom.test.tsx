// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScanHero } from "./scan-hero";

vi.mock("@/app/dashboard/actions", () => ({ resolveTokenAction: vi.fn() }));

describe("ScanHero", () => {
  it("renders the scan target label and sub copy as a button", () => {
    render(<ScanHero onResolved={vi.fn()} />);
    const target = screen.getByRole("button", {
      name: /scan the customer's card/i,
    });
    expect(target).toBeInTheDocument();
    expect(screen.getByText("Camera opens when you tap")).toBeInTheDocument();
  });

  it("renders the hero frame chrome (cornered dashed target)", () => {
    render(<ScanHero onResolved={vi.fn()} />);
    const target = screen.getByRole("button", {
      name: /scan the customer's card/i,
    });
    expect(target.className).toContain("border-dashed");
  });
});
