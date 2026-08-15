import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireAdminMock,
  updateMock,
  eqMock,
  fromMock,
  insertMock,
  revalidatePathMock,
} = vi.hoisted(() => {
  const eqMock = vi.fn(
    async (): Promise<{ error: { message: string } | null }> => ({
      error: null,
    }),
  );
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  const insertMock = vi.fn(async () => ({ error: null }));
  const fromMock = vi.fn((table: string) =>
    table === "pricing" ? { update: updateMock } : { insert: insertMock },
  );
  return {
    requireAdminMock: vi.fn(async () => ({ user: { id: "admin1" } })),
    updateMock,
    eqMock,
    fromMock,
    insertMock,
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("@/lib/admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock })),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { setPricing } from "./actions";

describe("setPricing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes monthly_cents to the pinned pricing row and records an audit entry", async () => {
    fromMock.mockImplementation((table: string) =>
      table === "pricing" ? { update: updateMock } : { insert: insertMock },
    );
    const res = await setPricing({ monthly_cents: 999 });

    expect(res.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ monthly_cents: 999 }),
    );
    expect(eqMock).toHaveBeenCalledWith("id", 1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: "admin1",
        action: "set_pricing",
        detail: { monthly_cents: 999 },
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/plan");
  });

  it("rejects a negative price without writing", async () => {
    const res = await setPricing({ monthly_cents: -100 });
    expect(res.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a price above MAX_MONEY_CENTS without writing", async () => {
    const res = await setPricing({ monthly_cents: 10_000_01 });
    expect(res.success).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("returns a friendly error when the update fails, without throwing", async () => {
    eqMock.mockResolvedValueOnce({ error: { message: "db down" } });
    const res = await setPricing({ monthly_cents: 999 });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("Could not update pricing");
  });

  it("404s via requireAdmin for a non-admin before touching pricing", async () => {
    requireAdminMock.mockImplementationOnce(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    await expect(setPricing({ monthly_cents: 999 })).rejects.toThrow();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
