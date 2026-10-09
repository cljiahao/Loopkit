import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  service: vi.fn(),
  server: vi.fn(),
  users: vi.fn(),
  bearer: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: mocks.service,
  createServerClient: mocks.server,
}));
vi.mock("@/features/auth", () => ({ requireVendor: vi.fn() }));
vi.mock("@/lib/list-all-users", () => ({ listAllUsers: mocks.users }));
vi.mock("@/lib/merqo-auth", () => ({ bearerOk: mocks.bearer }));
import { platformTotals } from "@/lib/admin-data";
import { getProgramStats } from "@/lib/stats";
import { GET as vendorStatus } from "@/app/api/merqo/vendor-status/route";
const rows: Record<string, Record<string, unknown>[]> = {};
const eqCalls: unknown[][] = [];
function query(table: string) {
  let subset = rows[table] ?? [];
  const builder = {
    select: () => builder,
    order: () => builder,
    in: (column: string, ids: string[]) => {
      subset = subset.filter((row) => ids.includes(String(row[column])));
      return builder;
    },
    eq: (column: string, value: string) => {
      eqCalls.push([table, column, value]);
      subset = subset.filter((row) => row[column] === value);
      return builder;
    },
    range: async (start: number) => ({
      data: subset.slice(start, start + 1),
      error: null,
    }),
    limit: async (limit: number) => ({
      data: subset.slice(0, limit),
      error: null,
    }),
  };
  return builder;
}
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of Object.keys(rows)) delete rows[key];
  eqCalls.length = 0;
  mocks.from.mockImplementation(query);
  const client = { from: mocks.from };
  mocks.server.mockResolvedValue(client);
  mocks.service.mockResolvedValue(client);
  mocks.bearer.mockReturnValue(true);
  mocks.users.mockResolvedValue({
    data: { users: [{ id: "wanted", email: "vendor@example.com" }] },
    error: null,
  });
});
describe("complete reporting integration", () => {
  it("counts later program/card/event pages", async () => {
    rows.programs = [
      { id: "p1", active: true },
      { id: "p2", active: false },
    ];
    rows.cards = [
      { id: "c1", reward_count: 1 },
      { id: "c2", reward_count: 3 },
    ];
    rows.stamp_events = [
      { id: "e1", kind: "stamp" },
      { id: "e2", kind: "stamp" },
    ];
    expect(await platformTotals()).toEqual({
      programs: 2,
      active_programs: 1,
      customers: 2,
      stamps_issued: 2,
      rewards_redeemed: 4,
    });
  });
  it("includes later card and event pages in program statistics", async () => {
    rows.cards = [
      { id: "c1", program_id: "p", created_at: "2026-10-01T00:00:00Z" },
      { id: "c2", program_id: "p", created_at: "2026-10-01T00:00:00Z" },
    ];
    rows.stamp_events = [
      {
        id: "e1",
        card_id: "c1",
        kind: "stamp",
        created_at: "2026-10-01T00:00:00Z",
      },
      {
        id: "e2",
        card_id: "c2",
        kind: "stamp",
        created_at: "2026-10-01T00:00:00Z",
      },
    ];
    const result = await getProgramStats("p");
    expect(result.enrolled).toBe(2);
    expect(result.visitsTotal).toBe(2);
  });
  it("checks vendor status against the matched user only", async () => {
    rows.programs = [
      { id: "other", vendor_id: "other" },
      { id: "wanted-program", vendor_id: "wanted" },
    ];
    rows.vendor_pro = [{ vendor_id: "wanted" }];
    const response = await vendorStatus(
      new Request(
        "https://loopkit.example/api/merqo/vendor-status?email=vendor%40example.com",
      ),
    );
    expect(await response.json()).toEqual({ active: true, plan: "pro" });
    expect(eqCalls).toEqual([
      ["programs", "vendor_id", "wanted"],
      ["vendor_pro", "vendor_id", "wanted"],
    ]);
  });
  it("rejects an unavailable auth directory", async () => {
    mocks.users.mockResolvedValue({
      data: null,
      error: { message: "offline" },
    });
    const response = await vendorStatus(
      new Request(
        "https://loopkit.example/api/merqo/vendor-status?email=vendor%40example.com",
      ),
    );
    expect(response.status).toBe(503);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
