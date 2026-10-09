// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Program } from "@/lib/program";
import type { CardRow } from "@/lib/cards";

vi.mock("@/features/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Error("REDIRECT:" + url);
  }),
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(),
  currentProgram: vi.fn(),
}));
vi.mock("@/lib/cards", () => ({ listCards: vi.fn() }));
vi.mock("@/lib/customers", () => ({
  listVendorCustomers: vi.fn(async () => []),
}));
vi.mock("@/lib/stats", async () => ({
  ...(await vi.importActual<typeof import("@/lib/stats")>("@/lib/stats")),
  getVendorOverviewInputs: vi.fn(),
}));
import CustomersPage from "./page";
import { listPrograms } from "@/lib/program";
import { listCards } from "@/lib/cards";
import { getVendorOverviewInputs } from "@/lib/stats";
import { redirect } from "next/navigation";

const program: Program = {
  id: "p1",
  name: "Coffee",
  stamps_required: 8,
  reward_text: "Coffee",
  type: "stamp",
  config: {},
  active: true,
  head_start: false,
  head_start_percent: 0,
  replaced_by: null,
  carry_over_stamps: false,
  birthday_bonus_enabled: false,
};
const card = (id: string, phone: string, stamp_count: number): CardRow => ({
  id,
  phone,
  stamp_count,
  reward_count: 0,
  state: {},
  updated_at: new Date().toISOString(),
});
const cards = [
  card("quiet", "+6590000001", 7),
  card("lapsed", "+6590000002", 6),
  card("ready", "+6590000003", 8),
  card("few-visits", "+6590000004", 1),
];
const events = (id: string, days: number, count = 3) =>
  Array.from({ length: count }, () => ({
    card_id: id,
    kind: "stamp",
    created_at: new Date(Date.now() - days * 86400000).toISOString(),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPrograms).mockResolvedValue([program]);
  vi.mocked(listCards).mockImplementation(async (_id, q) =>
    cards.filter((row) => !q || row.phone.includes(q)),
  );
  vi.mocked(getVendorOverviewInputs).mockResolvedValue({
    cards: cards.map((row) => ({
      id: row.id,
      program_id: "p1",
      stamp_count: row.stamp_count,
      created_at: row.updated_at,
    })),
    activityEvents: [
      ...events("quiet", 25),
      ...events("lapsed", 45),
      ...events("ready", 5),
      ...events("few-visits", 25, 2),
    ],
    rewardEvents: [],
  });
});

describe("overview cohort route boundary", () => {
  it("shows the 21–40 day regular cohort, excluding long-lapsed and infrequent cards", async () => {
    render(
      await CustomersPage({
        searchParams: Promise.resolve({ cohort: "gone-quiet" }),
      }),
    );
    expect(screen.getByText("+6590000001")).toBeInTheDocument();
    expect(screen.queryByText("+6590000002")).not.toBeInTheDocument();
    expect(screen.queryByText("+6590000004")).not.toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
  it.each([
    ["one-away", "+6590000001"],
    ["two-away", "+6590000002"],
  ])(
    "shows exact %s cards instead of reward-ready cards",
    async (cohort, phone) => {
      render(
        await CustomersPage({ searchParams: Promise.resolve({ cohort }) }),
      );
      expect(screen.getByText(phone)).toBeInTheDocument();
      expect(screen.queryByText("+6590000003")).not.toBeInTheDocument();
      expect(screen.getAllByRole("link", { name: "Serve" })).toHaveLength(1);
    },
  );
  it("preserves cohort/program parameters through phone search and enforces selected program ownership", async () => {
    const { container } = render(
      await CustomersPage({
        searchParams: Promise.resolve({
          cohort: "one-away",
          p: "p1",
          q: "0001",
        }),
      }),
    );
    expect(container.querySelector('input[name="cohort"]')).toHaveValue(
      "one-away",
    );
    expect(container.querySelector('input[name="p"]')).toHaveValue("p1");
    expect(listCards).toHaveBeenCalledWith("p1", "0001");
  });
  it("does not load cards for an unknown or foreign program selection", async () => {
    render(
      await CustomersPage({
        searchParams: Promise.resolve({ cohort: "one-away", p: "foreign" }),
      }),
    );
    expect(getVendorOverviewInputs).toHaveBeenCalledWith([]);
    expect(listCards).not.toHaveBeenCalled();
    expect(screen.getByText("No matching cards.")).toBeInTheDocument();
  });
  it("keeps two matching cards for one phone distinct across programs", async () => {
    const second = { ...program, id: "p2", name: "Bakery" };
    vi.mocked(listPrograms).mockResolvedValue([program, second]);
    vi.mocked(listCards).mockImplementation(async (id) => [
      card(id + "-card", "+6591111111", 7),
    ]);
    vi.mocked(getVendorOverviewInputs).mockResolvedValue({
      cards: [program, second].map((row) => ({
        id: row.id + "-card",
        program_id: row.id,
        stamp_count: 7,
        created_at: new Date().toISOString(),
      })),
      activityEvents: [],
      rewardEvents: [],
    });
    render(
      await CustomersPage({
        searchParams: Promise.resolve({ cohort: "one-away" }),
      }),
    );
    expect(screen.getAllByText("+6591111111")).toHaveLength(2);
    expect(
      screen.getByText("2 matching cards across the selected programs."),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("link", { name: "Serve" })
        .map((link) => link.getAttribute("href")),
    ).toEqual([
      "/dashboard/counter?p=p1&phone=%2B6591111111",
      "/dashboard/counter?p=p2&phone=%2B6591111111",
    ]);
  });
  it("preserves explicit customer segments and sort on a single-program vendor", async () => {
    render(
      await CustomersPage({
        searchParams: Promise.resolve({ seg: "lapsed", sort: "away" }),
      }),
    );
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /not seen 30d/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
