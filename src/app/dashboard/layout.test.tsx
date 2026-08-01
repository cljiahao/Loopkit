// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
}));

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn().mockResolvedValue({
    user: { id: "u1", email: "vendor@business.sg", user_metadata: {} },
  }),
}));
vi.mock("@/lib/admin", () => ({ isAdmin: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/program", () => ({ isPro: vi.fn().mockResolvedValue(false) }));
vi.mock("@/lib/vendor", () => ({
  getVendorProfile: vi.fn().mockResolvedValue({ name: "Kopi & Co" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: { signOut: vi.fn() },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ maybeSingle: mocks.maybeSingle }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/dashboard/dashboard-nav", () => ({
  DashboardNav: () => <div data-testid="dashboard-nav" />,
}));
vi.mock("@/components/dashboard-tour", () => ({
  DashboardTour: ({ seen }: { seen: boolean }) => (
    <div data-testid="dashboard-tour" data-seen={String(seen)} />
  ),
}));

import DashboardLayout from "./layout";

beforeEach(() => {
  mocks.maybeSingle.mockReset().mockResolvedValue({ data: null });
});

describe("DashboardLayout", () => {
  it("renders the sticky header matching qkit's px-5 py-3.5 sizing", async () => {
    render(await DashboardLayout({ children: <div>content</div> }));

    const header = screen.getByRole("banner");
    expect(header).toHaveClass("px-5", "py-3.5", "backdrop-blur-md");
    expect(screen.getByTestId("dashboard-nav")).toBeInTheDocument();
  });

  it("passes seen=false to DashboardTour when the vendor has never completed it", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { tour_seen_at: null } });
    render(await DashboardLayout({ children: <div>content</div> }));

    expect(screen.getByTestId("dashboard-tour")).toHaveAttribute(
      "data-seen",
      "false",
    );
  });

  it("passes seen=true to DashboardTour once tour_seen_at is set", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { tour_seen_at: "2026-08-01T00:00:00.000Z" },
    });
    render(await DashboardLayout({ children: <div>content</div> }));

    expect(screen.getByTestId("dashboard-tour")).toHaveAttribute(
      "data-seen",
      "true",
    );
  });

  it("passes seen=false when the vendor row doesn't exist yet", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    render(await DashboardLayout({ children: <div>content</div> }));

    expect(screen.getByTestId("dashboard-tour")).toHaveAttribute(
      "data-seen",
      "false",
    );
  });
});
