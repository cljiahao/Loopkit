import { describe, it, expect, vi, beforeEach } from "vitest";

const { insertMock, fromMock } = vi.hoisted(() => {
  const insertMock = vi.fn(
    async (): Promise<{ error: { message: string } | null }> => ({
      error: null,
    }),
  );
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  return { insertMock, fromMock };
});
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

import { recordAudit } from "@/lib/admin-audit";

describe("recordAudit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts a row shaped exactly like the admin_audit table", async () => {
    await recordAudit("actor-1", "set_vendor_pro", "vendor-1", { pro: true });

    expect(fromMock).toHaveBeenCalledWith("admin_audit");
    expect(insertMock).toHaveBeenCalledWith({
      admin_id: "actor-1",
      action: "set_vendor_pro",
      target_id: "vendor-1",
      detail: { pro: true },
    });
  });

  it("accepts a null target_id (actions with no single target, e.g. set_pricing)", async () => {
    await recordAudit("actor-1", "set_pricing", null, { monthly_cents: 999 });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ target_id: null }),
    );
  });

  it("logs and swallows an insert error rather than throwing — best-effort by design", async () => {
    insertMock.mockResolvedValueOnce({ error: { message: "db down" } });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      recordAudit("actor-1", "set_vendor_pro", "vendor-1", {}),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "admin_audit insert failed",
      "db down",
    );

    consoleError.mockRestore();
  });
});
