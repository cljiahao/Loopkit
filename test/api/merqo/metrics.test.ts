import { describe, it, expect, beforeEach, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

import { GET } from "@/app/api/merqo/metrics/route";

// thenable query-builder stub: methods return this; awaiting resolves { data, error }
function result(rows: unknown[]) {
  const r: Record<string, unknown> = {};
  const chain = () => r;
  Object.assign(r, {
    select: chain,
    eq: chain,
    then: (res: (v: { data: unknown[]; error: null }) => void) =>
      res({ data: rows, error: null }),
  });
  return r;
}

describe("GET /api/merqo/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERQO_METRICS_SECRET = "test-secret";
  });

  const req = (auth?: string) =>
    new Request("http://localhost/api/merqo/metrics", {
      headers: auth ? { Authorization: auth } : {},
    });

  it("401 when the bearer is missing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("401 when the bearer is wrong", async () => {
    const res = await GET(req("Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("401 when the server secret is unset", async () => {
    delete process.env.MERQO_METRICS_SECRET;
    const res = await GET(req("Bearer "));
    expect(res.status).toBe(401);
  });

  it("200 returns the contract shape on a valid bearer", async () => {
    fromMock
      .mockReturnValueOnce(
        result([
          { id: "p1", active: true, created_at: new Date().toISOString() },
        ]),
      )
      .mockReturnValueOnce(result([{ id: "c1", program_id: "p1" }]))
      .mockReturnValueOnce(
        result([
          {
            card_id: "c1",
            kind: "stamp",
            created_at: new Date().toISOString(),
          },
        ]),
      );

    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product).toBe("loopkit");
    expect(typeof body.generated_at).toBe("string");
    for (const k of [
      "revenue_cents_30d",
      "revenue_cents_all",
      "gmv_cents_30d",
      "active_vendors",
      "orders_7d",
      "orders_prev_7d",
      "signups_7d",
      "pro_vendors",
      "total_vendors",
      "pending_upgrade_requests",
    ]) {
      expect(typeof body[k]).toBe("number");
    }
    expect(body.funnel).toEqual(
      expect.objectContaining({
        signed_up: expect.any(Number),
        with_booth: expect.any(Number),
        with_order: expect.any(Number),
        pro: expect.any(Number),
      }),
    );
    expect(body.total_vendors).toBe(1);
    expect(body.active_vendors).toBe(1);
  });

  it("503 when a table read errors", async () => {
    // The route issues all three reads before checking errors, so every
    // .from() must return a valid thenable; make them all resolve to an error.
    const errorResult = () => {
      const r: Record<string, unknown> = {};
      const chain = () => r;
      Object.assign(r, {
        select: chain,
        eq: chain,
        then: (res: (v: { data: null; error: { message: string } }) => void) =>
          res({ data: null, error: { message: "boom" } }),
      });
      return r;
    };
    fromMock.mockReturnValue(errorResult());
    const res = await GET(req("Bearer test-secret"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Upstream unavailable" });
  });
});
