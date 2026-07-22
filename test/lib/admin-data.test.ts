import { describe, it, expect, vi, beforeEach } from "vitest";

// Generic chainable/awaitable query-builder stub, keyed per table so a test
// can configure what each `.from(table)` call resolves to independently —
// mirrors test/lib/cards.test.ts's single-table version, extended for
// admin-data.ts's multi-table reads.
const { fromMock, listUsersMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  listUsersMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({
    from: fromMock,
    auth: { admin: { listUsers: listUsersMock } },
  })),
}));

import {
  listProgramsOverview,
  listVendors,
  listPendingUpgradeRequests,
  platformTotals,
  recentActivity,
  getProgramDetail,
} from "@/lib/admin-data";

function builder(data: unknown, error: unknown = null) {
  const b: Record<string, unknown> = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    order: vi.fn(() => b),
    limit: vi.fn(() => b),
    in: vi.fn(() => b),
    maybeSingle: () => Promise.resolve({ data, error }),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve({ data, error }),
  };
  return b;
}

function mockTables(tables: Record<string, unknown>) {
  fromMock.mockImplementation((table: string) => builder(tables[table] ?? []));
}

const users = [
  { id: "v1", email: "vendor1@x.com" },
  { id: "v2", email: "vendor2@x.com" },
];

describe("admin-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listUsersMock.mockResolvedValue({ data: { users }, error: null });
  });

  describe("listProgramsOverview", () => {
    it("aggregates cards/events per program and resolves vendor email", async () => {
      mockTables({
        programs: [
          {
            id: "p1",
            name: "Coffee Stamps",
            active: true,
            vendor_id: "v1",
            created_at: "2026-07-01T00:00:00Z",
          },
        ],
        cards: [
          { id: "c1", program_id: "p1", reward_count: 2 },
          { id: "c2", program_id: "p1", reward_count: 0 },
        ],
        stamp_events: [
          { card_id: "c1", kind: "stamp", created_at: "2026-07-02T00:00:00Z" },
          { card_id: "c1", kind: "redeem", created_at: "2026-07-03T00:00:00Z" },
        ],
      });

      const rows = await listProgramsOverview();

      expect(rows).toEqual([
        {
          id: "p1",
          name: "Coffee Stamps",
          active: true,
          vendor_email: "vendor1@x.com",
          customer_count: 2,
          stamps_issued: 1,
          rewards_redeemed: 2,
          last_activity_at: "2026-07-03T00:00:00Z",
          created_at: "2026-07-01T00:00:00Z",
        },
      ]);
    });

    it("throws when a read errors", async () => {
      fromMock.mockReturnValueOnce(builder(null, { message: "boom" }));
      await expect(listProgramsOverview()).rejects.toThrow(
        "listProgramsOverview",
      );
    });
  });

  describe("listVendors", () => {
    it("counts programs per vendor and flags Pro, sorted by email", async () => {
      mockTables({
        programs: [
          { vendor_id: "v2" },
          { vendor_id: "v1" },
          { vendor_id: "v1" },
        ],
        vendor_pro: [{ vendor_id: "v1" }],
      });

      const rows = await listVendors();

      expect(rows).toEqual([
        {
          vendor_id: "v1",
          email: "vendor1@x.com",
          program_count: 2,
          is_pro: true,
        },
        {
          vendor_id: "v2",
          email: "vendor2@x.com",
          program_count: 1,
          is_pro: false,
        },
      ]);
    });

    it("throws when a read errors", async () => {
      fromMock.mockReturnValueOnce(builder(null, { message: "boom" }));
      await expect(listVendors()).rejects.toThrow("listVendors");
    });
  });

  describe("listPendingUpgradeRequests", () => {
    it("returns pending requests oldest-first with resolved emails", async () => {
      mockTables({
        upgrade_requests: [
          { id: "r1", vendor_id: "v1", created_at: "2026-07-01T00:00:00Z" },
        ],
      });

      const rows = await listPendingUpgradeRequests();

      expect(rows).toEqual([
        {
          id: "r1",
          vendor_id: "v1",
          email: "vendor1@x.com",
          created_at: "2026-07-01T00:00:00Z",
        },
      ]);
    });

    it("throws when the read errors", async () => {
      fromMock.mockReturnValue(builder(null, { message: "boom" }));
      await expect(listPendingUpgradeRequests()).rejects.toThrow(
        "listPendingUpgradeRequests",
      );
    });
  });

  describe("platformTotals", () => {
    it("sums totals across programs/cards/events", async () => {
      mockTables({
        programs: [
          { id: "p1", active: true },
          { id: "p2", active: false },
        ],
        cards: [
          { id: "c1", reward_count: 1 },
          { id: "c2", reward_count: 3 },
        ],
        stamp_events: [
          { kind: "stamp" },
          { kind: "stamp" },
          { kind: "redeem" },
        ],
      });

      const totals = await platformTotals();

      expect(totals).toEqual({
        programs: 2,
        active_programs: 1,
        customers: 2,
        stamps_issued: 2,
        rewards_redeemed: 4,
      });
    });

    it("throws when a read errors", async () => {
      fromMock.mockReturnValueOnce(builder(null, { message: "boom" }));
      await expect(platformTotals()).rejects.toThrow("platformTotals");
    });
  });

  describe("recentActivity", () => {
    it("joins card phone and program name onto each event", async () => {
      mockTables({
        stamp_events: [
          {
            id: "e1",
            kind: "stamp",
            created_at: "2026-07-01T00:00:00Z",
            card_id: "c1",
          },
        ],
        cards: [{ id: "c1", phone: "+6591234567", program_id: "p1" }],
        programs: [{ id: "p1", name: "Coffee Stamps" }],
      });

      const rows = await recentActivity();

      expect(rows).toEqual([
        {
          id: "e1",
          kind: "stamp",
          created_at: "2026-07-01T00:00:00Z",
          phone: "+6591234567",
          program_name: "Coffee Stamps",
        },
      ]);
    });

    it("returns an empty phone/program-name join when there are no events", async () => {
      mockTables({ stamp_events: [] });
      const rows = await recentActivity();
      expect(rows).toEqual([]);
    });

    it("throws when the events read errors", async () => {
      fromMock.mockReturnValueOnce(builder(null, { message: "boom" }));
      await expect(recentActivity()).rejects.toThrow("recentActivity");
    });
  });

  describe("getProgramDetail", () => {
    it("returns the program with its cards, events, and vendor email", async () => {
      mockTables({
        programs: {
          id: "p1",
          name: "Coffee Stamps",
          active: true,
          stamps_required: 8,
          reward_text: "a free coffee",
          vendor_id: "v1",
          created_at: "2026-07-01T00:00:00Z",
        },
        cards: [
          {
            id: "c1",
            phone: "+6591234567",
            stamp_count: 3,
            reward_count: 0,
            state: {},
            updated_at: "2026-07-02T00:00:00Z",
          },
        ],
        stamp_events: [
          {
            id: "e1",
            kind: "stamp",
            created_at: "2026-07-02T00:00:00Z",
            card_id: "c1",
          },
        ],
      });

      const detail = await getProgramDetail("p1");

      expect(detail?.program.name).toBe("Coffee Stamps");
      expect(detail?.vendor_email).toBe("vendor1@x.com");
      expect(detail?.cards).toHaveLength(1);
      expect(detail?.events).toEqual([
        {
          id: "e1",
          kind: "stamp",
          created_at: "2026-07-02T00:00:00Z",
          phone: "+6591234567",
        },
      ]);
    });

    it("returns null when the program doesn't exist", async () => {
      // Not mockTables() — its `?? []` fallback would coerce a literal `null`
      // maybeSingle() result into `[]`, masking the case under test.
      fromMock.mockReturnValueOnce(builder(null));
      const detail = await getProgramDetail("missing");
      expect(detail).toBeNull();
    });

    it("throws when the program read errors", async () => {
      fromMock.mockReturnValueOnce(builder(null, { message: "boom" }));
      await expect(getProgramDetail("p1")).rejects.toThrow("getProgramDetail");
    });
  });
});
