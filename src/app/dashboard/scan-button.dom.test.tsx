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
});
