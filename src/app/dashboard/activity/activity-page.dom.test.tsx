// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityTable } from "./activity-table";
import type { VendorActivityRow } from "@/lib/activity";

vi.mock("@/features/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));

const programs = [
  { id: "p1", name: "Coffee Stamps", type: "stamp" },
  { id: "p2", name: "Bakery Stamps", type: "stamp" },
];

vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => programs),
  currentProgram: (progs: { id: string }[], id?: string) =>
    progs.find((p) => p.id === id) ?? null,
}));
vi.mock("@/lib/activity", () => ({
  listActivity: vi.fn(async () => ({ rows: [], hasMore: false })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const activity: VendorActivityRow[] = [
  {
    id: "e1",
    phone: "+6591234567",
    programName: "Coffee Stamps",
    kind: "stamp",
    isReward: false,
    label: "stamp",
    createdAt: "2026-07-10T00:00:00Z",
  },
];

describe("ActivityTable", () => {
  it("renders an event's phone and program badge when showProgram is true", () => {
    render(<ActivityTable activity={activity} showProgram />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Program" }),
    ).toBeInTheDocument();
  });

  it("omits the Program column when showProgram is false", () => {
    render(<ActivityTable activity={activity} showProgram={false} />);
    expect(
      screen.queryByRole("columnheader", { name: "Program" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Coffee Stamps")).not.toBeInTheDocument();
  });

  it("shows an empty state with zero activity", () => {
    render(<ActivityTable activity={[]} showProgram />);
    expect(
      screen.getByText(/no activity matches these filters/i),
    ).toBeInTheDocument();
  });
});

describe("ActivityPage", () => {
  it("renders the vendor-wide view (no ?p=) when the vendor runs more than one program", async () => {
    const ActivityPage = (await import("./page")).default;
    render(await ActivityPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "Activity" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/across every program/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no activity matches these filters/i),
    ).toBeInTheDocument();
  });

  it("renders the program-scoped view and its activity table when ?p= is set", async () => {
    const ActivityPage = (await import("./page")).default;
    const { listActivity } = await import("@/lib/activity");
    vi.mocked(listActivity).mockResolvedValueOnce({
      rows: activity,
      hasMore: true,
    });

    render(await ActivityPage({ searchParams: Promise.resolve({ p: "p1" }) }));

    expect(screen.getByText(/for coffee stamps/i)).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Next →")).toBeInTheDocument();
  });

  it("shows a Previous link once past page 1", async () => {
    const ActivityPage = (await import("./page")).default;

    render(
      await ActivityPage({
        searchParams: Promise.resolve({ p: "p1", page: "2" }),
      }),
    );

    const previous = screen.getByText("← Previous");
    expect(previous).toBeInTheDocument();
    expect(previous.closest("a")).toHaveAttribute(
      "href",
      "/dashboard/activity?p=p1&page=1",
    );
  });

  it("redirects to /setup for a p that isn't one of the vendor's programs", async () => {
    const ActivityPage = (await import("./page")).default;

    await expect(
      ActivityPage({ searchParams: Promise.resolve({ p: "not-a-program" }) }),
    ).rejects.toThrow("REDIRECT:/setup");
  });

  it("redirects to the vendor's one program, carrying filters, when there's only one", async () => {
    const ActivityPage = (await import("./page")).default;
    const { listPrograms } = await import("@/lib/program");
    vi.mocked(listPrograms).mockResolvedValueOnce([
      programs[0],
    ] as unknown as Awaited<ReturnType<typeof listPrograms>>);

    await expect(
      ActivityPage({
        searchParams: Promise.resolve({ type: "stamps", page: "2" }),
      }),
    ).rejects.toThrow("REDIRECT:/dashboard/activity?type=stamps&page=2&p=p1");
  });
});
