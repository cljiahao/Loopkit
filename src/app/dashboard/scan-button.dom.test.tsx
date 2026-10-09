// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScanButton } from "./scan-button";

vi.mock("@/app/dashboard/actions", () => ({ resolveTokenAction: vi.fn() }));

describe("ScanButton", () => {
  it("renders the default label", () => {
    render(<ScanButton onResolved={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /scan to serve/i }),
    ).toBeInTheDocument();
  });

  it("renders a custom label when provided", () => {
    render(<ScanButton label="Scan a customer" onResolved={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /scan a customer/i }),
    ).toBeInTheDocument();
  });

  it("renders the hero variant as a large cornered target with a sub line", () => {
    render(
      <ScanButton
        variant="hero"
        label="Scan the customer's card"
        sublabel="Camera opens when you tap"
        onResolved={vi.fn()}
      />,
    );
    const target = screen.getByRole("button", {
      name: /scan the customer's card/i,
    });
    expect(target.className).toContain("border-dashed");
    expect(screen.getByText("Camera opens when you tap")).toBeInTheDocument();
  });
});
