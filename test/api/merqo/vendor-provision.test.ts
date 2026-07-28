import { describe, it, expect, beforeEach, vi } from "vitest";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock, rpc: rpcMock })),
}));

import { POST } from "@/app/api/merqo/vendor-provision/route";

const USER_ID = "11111111-1111-1111-1111-111111111111";

function req(body: unknown, auth?: string) {
  return new Request("http://localhost/api/merqo/vendor-provision", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

// loopkit's own resolveVendorStatus (src/lib/merqo-vendor-status.ts) derives
// plan from vendor_pro row existence, NOT a vendors.plan column — mirror
// that exactly here, so `fromMock` must branch on which table is queried.
function tables(opts: {
  insertError?: { code: string; message: string } | null;
  isPro?: boolean;
  proReadError?: { message: string } | null;
}) {
  return (table: string) => {
    if (table === "vendors") {
      return {
        insert: () => Promise.resolve({ error: opts.insertError ?? null }),
      };
    }
    if (table === "vendor_pro") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: opts.isPro ? { vendor_id: USER_ID } : null,
                error: opts.proReadError ?? null,
              }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  };
}

describe("POST /api/merqo/vendor-provision (loopkit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERQO_PROVISION_SECRET = "test-secret";
    rpcMock.mockResolvedValue({ data: "new-program-id", error: null });
  });

  it("401 when the bearer is missing", async () => {
    const res = await POST(req({ user_id: USER_ID }));
    expect(res.status).toBe(401);
  });

  it("creates the vendor row AND calls provision_default_program on first provision", async () => {
    fromMock.mockImplementation(tables({ insertError: null, isPro: false }));
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      already_existed: false,
      plan: "free",
    });
    expect(rpcMock).toHaveBeenCalledWith("provision_default_program", {
      p_vendor_id: USER_ID,
    });
  });

  it("re-provision (already exists) does NOT call provision_default_program again", async () => {
    fromMock.mockImplementation(
      tables({
        insertError: { code: "23505", message: "duplicate key" },
        isPro: false,
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      already_existed: true,
      plan: "free",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reports plan pro when the vendor already has a vendor_pro row", async () => {
    fromMock.mockImplementation(
      tables({
        insertError: { code: "23505", message: "duplicate key" },
        isPro: true,
      }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(await res.json()).toEqual({
      ok: true,
      already_existed: true,
      plan: "pro",
    });
  });

  it("500 when provision_default_program errors", async () => {
    fromMock.mockImplementation(tables({ insertError: null, isPro: false }));
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(500);
  });

  it("400 on a foreign-key violation (unknown user_id)", async () => {
    fromMock.mockImplementation(
      tables({ insertError: { code: "23503", message: "fk violation" } }),
    );
    const res = await POST(req({ user_id: USER_ID }, "Bearer test-secret"));
    expect(res.status).toBe(400);
  });
});
