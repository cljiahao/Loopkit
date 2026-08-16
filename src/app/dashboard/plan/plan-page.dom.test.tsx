// @vitest-environment jsdom
//
// The feature-comparison grid renders through the shared @merqo/ui
// PlanComparisonTable (migrated off a local FEATURES/Cell grid) — same
// visible behavior (column order, check/dash rendering, the string-valued
// "Loyalty programs" row), verified against the new render path. The tier
// badge at the top of the page can share text with the grid's own tier
// column headers (both say "Free" on a Free vendor), so grid assertions are
// scoped to the grid's own container rather than the whole page.
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

function getGrid(container: HTMLElement) {
  const grid = container.querySelector(".overflow-hidden.rounded-2xl.border");
  if (!grid) throw new Error("comparison grid container not found");
  return within(grid as HTMLElement);
}

vi.mock("@/features/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));
vi.mock("@/app/dashboard/plan/actions", () => ({
  requestUpgrade: vi.fn(),
}));

const program = { id: "p1", name: "Coffee Stamps", type: "stamp" };

vi.mock("@/lib/program", () => ({
  isPro: vi.fn(async () => false),
  listPrograms: vi.fn(async () => [program]),
  currentProgram: (progs: { id: string }[], id?: string) =>
    progs.find((p) => p.id === id) ?? null,
}));
vi.mock("@/lib/stats", () => ({
  getProgramStats: vi.fn(async () => ({
    enrolled: 5,
    repeatVisitRate: 0.6,
    rewardsTotal: 3,
  })),
}));
vi.mock("@/lib/pricing", () => ({
  getPricing: vi.fn(async () => ({ monthly_cents: 499, currency: "SGD" })),
}));

import PlanPage from "./page";

describe("PlanPage", () => {
  it("shows the Pro upsell card and the feature comparison table for a Free vendor", async () => {
    render(await PlanPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/run more than one loyalty program/i),
    ).toBeInTheDocument();
    expect(screen.getByText("$4.99")).toBeInTheDocument();
    expect(screen.getByText("Loyalty programs")).toBeInTheDocument();
  });

  it("renders the Free/Pro header columns via PlanComparisonTable", async () => {
    const { container } = render(
      await PlanPage({ searchParams: Promise.resolve({}) }),
    );
    const grid = getGrid(container);

    expect(grid.getByText("Feature")).toBeInTheDocument();
    expect(grid.getByText("Free")).toBeInTheDocument();
    expect(grid.getByText("Pro")).toBeInTheDocument();
  });

  it("renders every FEATURES row label, in order, with the right check/dash/string cells", async () => {
    const { container } = render(
      await PlanPage({ searchParams: Promise.resolve({}) }),
    );
    const grid = getGrid(container);

    const rowLabels = [
      "Loyalty programs",
      "Loyalty card templates",
      "Change card type",
      "Stats dashboard",
    ];
    const rowDivs = Array.from(
      container.querySelectorAll(
        ".overflow-hidden.rounded-2xl.border > .border-t",
      ),
    );
    expect(rowDivs.map((el) => el.querySelector("span")?.textContent)).toEqual(
      rowLabels,
    );

    // "Loyalty programs": free="1", pro="∞" — string values, no check icons.
    const loyaltyProgramsRow = grid
      .getByText("Loyalty programs")
      .closest("div");
    expect(loyaltyProgramsRow?.querySelectorAll("svg").length).toBe(0);
    expect(loyaltyProgramsRow?.textContent).toContain("1");
    expect(loyaltyProgramsRow?.textContent).toContain("∞");

    // "Loyalty card templates": free=true, pro=true -> two checks, no dash.
    const templatesRow = grid
      .getByText("Loyalty card templates")
      .closest("div");
    expect(templatesRow?.querySelectorAll("svg").length).toBe(2);
    expect(templatesRow?.textContent).not.toContain("-");
  });

  it("shows the Pro-active message and program stats summary for a Pro vendor", async () => {
    const { isPro } = await import("@/lib/program");
    vi.mocked(isPro).mockResolvedValueOnce(true);
    render(await PlanPage({ searchParams: Promise.resolve({ p: "p1" }) }));
    expect(
      screen.getByText(/unlimited loyalty programs are unlocked/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/how your program is doing/i)).toBeInTheDocument();
  });
});
