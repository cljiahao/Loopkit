// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Program } from "@/lib/program";
import type { ProgramStats } from "@/lib/stats";

// ProgramCard renders the unchanged ServeCustomer widget, which calls
// useRouter().refresh() — stub next/navigation so it can mount outside a
// real App Router context, matching test/app/serve-customer.test.tsx.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProgramCard } from "./program-card";

const program: Program = {
  id: "p1",
  name: "Coffee Stamps",
  stamps_required: 8,
  reward_text: "a free coffee",
  type: "stamp",
  config: {},
  active: true,
  expiry_days: null,
  head_start: false,
  replaced_by: null,
  carry_over_stamps: false,
};

const stats = { active: 12 } as ProgramStats;

describe("ProgramCard", () => {
  it("renders the program name, type badge, and description", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Stamp")).toBeInTheDocument();
    expect(screen.getByText(/buy 8, get 1 a free coffee/i)).toBeInTheDocument();
  });

  it("links Edit to /setup?edit=<id>", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(
      screen.getByRole("link", { name: /edit coffee stamps/i }),
    ).toHaveAttribute("href", "/setup?edit=p1");
  });

  it("shows the active-count stat when stats are available", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByText(/12 active/i)).toBeInTheDocument();
  });

  it("falls back to a dash when stats are null (fetch failed)", () => {
    render(<ProgramCard program={program} stats={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("scopes footer links to this program via ?p=", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "href",
      "/dashboard/customers?p=p1",
    );
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/dashboard/activity?p=p1",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats?p=p1",
    );
  });

  it("renders the ServeCustomer widget for this program", () => {
    render(<ProgramCard program={program} stats={stats} />);
    expect(screen.getByLabelText(/customer phone/i)).toBeInTheDocument();
  });
});
