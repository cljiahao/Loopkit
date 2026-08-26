import { describe, it, expect, beforeEach, vi } from "vitest";

const { listUsersMock, fromMock } = vi.hoisted(() => ({
  listUsersMock: vi.fn(),
  fromMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({
    auth: { admin: { listUsers: listUsersMock } },
    from: fromMock,
  })),
}));

import { GET } from "@/app/api/merqo/vendor-activity/route";

function user(id: string, email: string) {
  return { id, email };
}

// Thenable query-builder stub: select/eq/in all return the same chain link,
// awaiting resolves { data, error } — mirrors test/api/merqo/metrics.test.ts.
function rows(data: unknown[], error: { message: string } | null = null) {
  const r: Record<string, unknown> = {};
  const chain = () => r;
  Object.assign(r, {
    select: chain,
    eq: chain,
    in: chain,
    then: (res: (v: { data: unknown[] | null; error: typeof error }) => void) =>
      res({ data: error ? null : data, error }),
  });
  return r;
}

type Table = "programs" | "vendor_pro" | "cards" | "stamp_events";

function mockTables(byTable: Partial<Record<Table, unknown[]>>) {
  fromMock.mockImplementation((table: Table) => rows(byTable[table] ?? []));
}

const req = (email: string, auth?: string) =>
  new Request(
    `http://localhost/api/merqo/vendor-activity?email=${encodeURIComponent(email)}`,
    { headers: auth ? { Authorization: auth } : {} },
  );

describe("GET /api/merqo/vendor-activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERQO_METRICS_SECRET = "test-secret";
  });

  it("401 when the bearer is missing", async () => {
    const res = await GET(req("v@x.com"));
    expect(res.status).toBe(401);
  });

  it("401 when the bearer is wrong", async () => {
    const res = await GET(req("v@x.com", "Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("400 when email is missing", async () => {
    const res = await GET(
      new Request("http://localhost/api/merqo/vendor-activity", {
        headers: { Authorization: "Bearer test-secret" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("404 when no auth user matches the email", async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [user("u1", "someone-else@x.com")] },
      error: null,
    });
    const res = await GET(req("nobody@x.com", "Bearer test-secret"));
    expect(res.status).toBe(404);
  });

  it("active:false with empty fields for a vendor with no programs", async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [user("v1", "vendor@x.com")] },
      error: null,
    });
    mockTables({ programs: [], vendor_pro: [] });

    const res = await GET(req("vendor@x.com", "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      active: false,
      plan: null,
      status: null,
      metrics: [],
      lastActivityAt: null,
    });
  });

  it("200 with real computed metrics for a vendor with programs", async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [user("v1", "vendor@x.com")] },
      error: null,
    });
    const now = Date.now();
    const recent = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    mockTables({
      programs: [{ id: "p1" }, { id: "p2" }],
      vendor_pro: [{ vendor_id: "v1" }],
      cards: [{ id: "c1" }, { id: "c2" }],
      stamp_events: [
        { card_id: "c1", kind: "stamp", created_at: recent },
        { card_id: "c2", kind: "redeem", created_at: recent },
      ],
    });

    const res = await GET(req("vendor@x.com", "Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(true);
    expect(body.plan).toBe("pro");
    expect(body.status).toBeNull();
    expect(body.metrics).toEqual([
      { label: "Programs", value: "2" },
      { label: "Cards", value: "2" },
      { label: "Stamps (30d)", value: "1" },
      { label: "Rewards redeemed (30d)", value: "1" },
    ]);
    expect(body.lastActivityAt).toBe(recent);
  });

  it("503 when listUsers errors", async () => {
    listUsersMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await GET(req("vendor@x.com", "Bearer test-secret"));
    expect(res.status).toBe(503);
  });

  it("503 when a table read errors", async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [user("v1", "vendor@x.com")] },
      error: null,
    });
    fromMock.mockReturnValue(rows([], { message: "db down" }));
    const res = await GET(req("vendor@x.com", "Bearer test-secret"));
    expect(res.status).toBe(503);
  });
});
