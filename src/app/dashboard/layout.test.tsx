// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
  }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/dashboard/dashboard-nav", () => ({
  DashboardNav: () => <div data-testid="dashboard-nav" />,
}));

import DashboardLayout from "./layout";

describe("DashboardLayout", () => {
  it("renders the sticky header matching qkit's px-5 py-3.5 sizing", async () => {
    render(await DashboardLayout({ children: <div>content</div> }));

    const header = screen.getByRole("banner");
    expect(header).toHaveClass("px-5", "py-3.5", "backdrop-blur-md");
    expect(screen.getByTestId("dashboard-nav")).toBeInTheDocument();
  });
});
