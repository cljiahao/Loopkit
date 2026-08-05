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
  it("wraps DashboardNav in a display:contents div, not its own <header>", async () => {
    // @merqo/ui's DashboardNav owns the actual <header> element (sticky/
    // border/background/blur) internally now — layout.tsx's own wrapper
    // must not introduce a second one, which would break the header's
    // `position: sticky` containing block. `display: contents` removes the
    // wrapper's own box from layout while still applying print:hidden.
    render(await DashboardLayout({ children: <div>content</div> }));

    const nav = screen.getByTestId("dashboard-nav");
    const wrapper = nav.parentElement;
    expect(wrapper).toHaveClass("contents", "print:hidden");
    expect(wrapper?.tagName).not.toBe("HEADER");
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
