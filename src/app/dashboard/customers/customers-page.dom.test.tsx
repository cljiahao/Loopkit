// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { VendorCustomerRow } from "@/lib/customers";

vi.mock("@/features/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));
vi.mock("@/lib/customers", () => ({
  listVendorCustomers: vi.fn(async () => []),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const program = { id: "p1", name: "Coffee Stamps", type: "stamp" };
// Two programs so a bare (no ?p=) request renders the vendor-wide list
// instead of redirecting to the vendor's one-and-only program.
const programs = [program, { id: "p2", name: "Bakery Stamps", type: "stamp" }];

vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => programs),
  currentProgram: (progs: { id: string }[], id?: string) =>
    progs.find((p) => p.id === id) ?? null,
}));
vi.mock("@/lib/cards", () => ({ listCards: vi.fn(async () => []) }));
vi.mock("@/lib/engine", () => ({
  getProgress: vi.fn(() => ({ label: "3/8 stamps" })),
}));

import CustomersPage, { VendorCustomerList } from "./page";

const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY).toISOString();

function row(over: Partial<VendorCustomerRow>): VendorCustomerRow {
  return {
    phone: "+6590000000",
    name: null,
    programNames: [],
    totalStamps: 0,
    totalRewards: 0,
    lastSeenAt: iso(1),
    firstSeenAt: iso(1),
    rewardReady: false,
    bestGap: null,
    recentProgramId: null,
    recentProgramName: null,
    ...over,
  };
}

const jane = row({
  phone: "+6591234567",
  name: "Jane",
  programNames: ["Coffee Stamps", "Lucky Tap"],
  totalStamps: 8,
  totalRewards: 1,
  lastSeenAt: iso(2),
  firstSeenAt: iso(60),
  rewardReady: true,
  bestGap: 0,
  recentProgramId: "p1",
  recentProgramName: "Coffee Stamps",
});
const bob = row({
  phone: "+6592222222",
  name: "Bob",
  programNames: ["Coffee Stamps"],
  lastSeenAt: iso(3),
  firstSeenAt: iso(3),
  bestGap: 2,
  recentProgramId: "p2",
  recentProgramName: "Bakery Stamps",
});
const cara = row({
  phone: "+6593333333",
  name: "Cara",
  programNames: ["Coffee Stamps"],
  lastSeenAt: iso(45),
  firstSeenAt: iso(90),
  bestGap: 5,
  recentProgramId: "p1",
  recentProgramName: "Coffee Stamps",
});

describe("VendorCustomerList", () => {
  it("renders a customer's name, phone, program badges, and totals", () => {
    render(<VendorCustomerList customers={[jane]} />);
    expect(screen.getByText("Jane")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Lucky Tap")).toBeInTheDocument();
    expect(
      screen.getByText("8 total stamps/visits · 1 reward"),
    ).toBeInTheDocument();
  });

  it("falls back to phone-only when name is null", () => {
    render(<VendorCustomerList customers={[row({ phone: "+6591234567" })]} />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
  });

  it("shows an empty state with zero customers", () => {
    render(<VendorCustomerList customers={[]} />);
    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
  });

  it("renders a Serve link to the counter for the row's recent program", () => {
    render(<VendorCustomerList customers={[jane]} />);
    const serve = screen.getByRole("link", { name: "Serve" });
    expect(serve).toHaveAttribute(
      "href",
      "/dashboard/counter?p=p1&phone=%2B6591234567",
    );
  });
});

describe("CustomersPage (vendor-wide)", () => {
  it("renders the merged list, segment chips with counts, and the search form", async () => {
    const { listVendorCustomers } = await import("@/lib/customers");
    vi.mocked(listVendorCustomers).mockResolvedValueOnce([jane, bob, cara]);

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "Customers" }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by phone")).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();

    const readyChip = screen.getByRole("link", { name: /reward ready/i });
    expect(readyChip).toHaveAttribute(
      "href",
      expect.stringContaining("seg=ready"),
    );
    expect(readyChip).toHaveTextContent("1");
    expect(
      screen.getByRole("link", { name: /new this week/i }),
    ).toHaveTextContent("1");
  });

  it("filters to only the lapsed rows when ?seg=lapsed", async () => {
    const { listVendorCustomers } = await import("@/lib/customers");
    vi.mocked(listVendorCustomers).mockResolvedValueOnce([jane, bob, cara]);

    render(
      await CustomersPage({
        searchParams: Promise.resolve({ seg: "lapsed" }),
      }),
    );

    expect(screen.getByText("Cara")).toBeInTheDocument();
    expect(screen.queryByText("Jane")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });

  it("orders rows oldest-last-seen-first when ?sort=away", async () => {
    const { listVendorCustomers } = await import("@/lib/customers");
    vi.mocked(listVendorCustomers).mockResolvedValueOnce([jane, bob, cara]);

    render(
      await CustomersPage({ searchParams: Promise.resolve({ sort: "away" }) }),
    );

    const names = screen.getAllByRole("link", { name: "Serve" }).map((el) => {
      const card = el.closest("li");
      return card ? within(card).getByText(/Jane|Bob|Cara/).textContent : null;
    });
    expect(names).toEqual(["Cara", "Bob", "Jane"]);
  });

  it("every shown row has a Serve link to its program at the counter", async () => {
    const { listVendorCustomers } = await import("@/lib/customers");
    vi.mocked(listVendorCustomers).mockResolvedValueOnce([jane, bob, cara]);

    render(await CustomersPage({ searchParams: Promise.resolve({}) }));

    const serves = screen.getAllByRole("link", { name: "Serve" });
    expect(serves).toHaveLength(3);
    for (const serve of serves) {
      expect(serve.getAttribute("href")).toMatch(
        /^\/dashboard\/counter\?p=p[12]&phone=%2B65\d+$/,
      );
    }
  });

  it("shows an empty state when the vendor has no customers on any program", async () => {
    render(await CustomersPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
  });

  it("redirects to the vendor's one program, carrying the q param, when there's only one", async () => {
    const { listPrograms } = await import("@/lib/program");
    vi.mocked(listPrograms).mockResolvedValueOnce([
      program,
    ] as unknown as Awaited<ReturnType<typeof listPrograms>>);

    await expect(
      CustomersPage({ searchParams: Promise.resolve({ q: "jane" }) }),
    ).rejects.toThrow("REDIRECT:/dashboard/customers?p=p1&q=jane");
  });
});

describe("CustomersPage (program-scoped)", () => {
  it("shows an empty state when the program has no cards yet", async () => {
    render(await CustomersPage({ searchParams: Promise.resolve({ p: "p1" }) }));
    expect(screen.getByText(/no customers yet/i)).toBeInTheDocument();
  });

  it("renders each card's phone, progress, and last-updated date", async () => {
    const { listCards } = await import("@/lib/cards");
    vi.mocked(listCards).mockResolvedValueOnce([
      {
        id: "c1",
        phone: "+6591234567",
        stamp_count: 3,
        reward_count: 0,
        state: {},
        updated_at: "2026-07-10T00:00:00Z",
      },
    ]);
    render(await CustomersPage({ searchParams: Promise.resolve({ p: "p1" }) }));
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("3/8 stamps")).toBeInTheDocument();
  });
});
