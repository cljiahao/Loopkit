// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VendorCustomerList } from "./page";
import type { VendorCustomerRow } from "@/lib/customers";

const customers: VendorCustomerRow[] = [
  {
    phone: "+6591234567",
    name: "Jane",
    programNames: ["Coffee Stamps", "Lucky Tap"],
    totalStamps: 8,
    totalRewards: 1,
    lastSeenAt: "2026-07-10T00:00:00Z",
  },
];

describe("VendorCustomerList", () => {
  it("renders a customer's name, phone, program badges, and totals", () => {
    render(<VendorCustomerList customers={customers} />);
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Lucky Tap")).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
  });

  it("falls back to phone-only when name is null", () => {
    const noName: VendorCustomerRow[] = [{ ...customers[0], name: null }];
    render(<VendorCustomerList customers={noName} />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
  });

  it("shows an empty state with zero customers", () => {
    render(<VendorCustomerList customers={[]} />);
    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
  });
});
