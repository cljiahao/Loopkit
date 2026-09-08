// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProgramStats } from "@/lib/stats";

const h = vi.hoisted(() => ({
  programs: [] as unknown[],
  enrolled: 40,
}));

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1", email: "v@x.com" } })),
}));
vi.mock("@/lib/vendor", () => ({
  getVendorProfile: vi.fn(async () => ({ name: "Kopi Corner" })),
}));
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => h.programs),
  applyDueCutovers: vi.fn(async () => {}),
}));
vi.mock("@/lib/activity", () => ({
  listActivity: vi.fn(async () => ({ rows: [], hasMore: false })),
}));
vi.mock("@/lib/stats", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/stats")>();
  const stats: ProgramStats = {
    enrolled: 0,
    newThisWeek: 0,
    visitsTotal: 0,
    visits30d: 0,
    visitsByDay: Array.from({ length: 30 }, (_, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      count: i,
    })),
    rewardsTotal: 0,
    rewards30d: 0,
    redemptionRate: 0.3,
    repeatVisitRate: 0.4,
    active: 20,
    lapsed: 5,
    avgVisitsPerCustomer: 3,
    visitsDelta: null,
    rewardsDelta: null,
    activeDelta: null,
    avgDaysBetweenVisits: 9,
  };
  return {
    ...actual,
    getVendorStats: vi.fn(async () => ({ ...stats, enrolled: h.enrolled })),
    countExpiredVouchers: vi.fn(async () => 2),
    getVendorOverviewInputs: vi.fn(async () => ({
      activityEvents: [],
      rewardEvents: [],
      cards: [],
    })),
  };
});

vi.mock("@/app/dashboard/serve-cta", () => ({
  ServeCta: () => <div>serve-cta</div>,
}));
vi.mock("@/app/dashboard/overview/briefing", () => ({
  Briefing: ({ text }: { text: string }) => <div>briefing:{text}</div>,
}));
vi.mock("@/app/dashboard/overview/base-strip", () => ({
  BaseStrip: () => <div>base-strip</div>,
}));
vi.mock("@/app/dashboard/overview/visits-trend", () => ({
  VisitsTrend: () => <div>visits-trend</div>,
}));
vi.mock("@/app/dashboard/overview/worth-a-look", () => ({
  WorthALook: () => <div>worth-a-look</div>,
}));
vi.mock("@/app/dashboard/overview/recent-activity", () => ({
  RecentActivity: () => <div>recent-activity</div>,
}));
vi.mock("@/app/dashboard/overview/reward-cost-panel", () => ({
  RewardCostPanel: () => <div>reward-cost-panel</div>,
}));
vi.mock("@/app/dashboard/overview/your-programs", () => ({
  YourPrograms: ({ programs }: { programs: unknown[] }) =>
    programs.length >= 2 ? <div>your-programs</div> : null,
}));

const program = (id: string, name: string) => ({
  id,
  name,
  type: "stamp",
  active: true,
  stamps_required: 10,
  reward_text: "Free coffee",
  reward_cost_cents: 80,
  config: {},
});

import DashboardPage from "./page";

describe("DashboardPage", () => {
  beforeEach(() => {
    h.programs = [program("p1", "Coffee Stamps")];
    h.enrolled = 40;
  });

  it("renders the briefing, base strip, trend and serve CTA", async () => {
    render(await DashboardPage());
    expect(screen.getByText(/^briefing:/)).toBeInTheDocument();
    expect(screen.getByText("base-strip")).toBeInTheDocument();
    expect(screen.getByText("visits-trend")).toBeInTheDocument();
    expect(screen.getByText("worth-a-look")).toBeInTheDocument();
    expect(screen.getByText("serve-cta")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Kopi Corner/ }),
    ).toBeInTheDocument();
  });

  it("hides Your programs with one program, shows it with two", async () => {
    render(await DashboardPage());
    expect(screen.queryByText("your-programs")).toBeNull();

    h.programs = [program("p1", "Coffee Stamps"), program("p2", "Lunch Club")];
    render(await DashboardPage());
    expect(screen.getByText("your-programs")).toBeInTheDocument();
  });

  it("renders the empty card and skips the trend when nobody is enrolled", async () => {
    h.enrolled = 0;
    render(await DashboardPage());
    expect(screen.getByText(/No customers yet/)).toBeInTheDocument();
    expect(screen.queryByText("visits-trend")).toBeNull();
    expect(screen.getByText("serve-cta")).toBeInTheDocument();
  });

  it("carries the shop-qr tour anchor", async () => {
    const { container } = render(await DashboardPage());
    expect(container.querySelector('[data-tour="shop-qr"]')).not.toBeNull();
  });
});
