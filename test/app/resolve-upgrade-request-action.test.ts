import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAdminMock, upsertMock, updateEqMock, insertMock } = vi.hoisted(
  () => ({
    requireAdminMock: vi.fn(),
    upsertMock: vi.fn(),
    updateEqMock: vi.fn(),
    insertMock: vi.fn(),
  }),
);

vi.mock("@/lib/admin", () => ({ requireAdmin: requireAdminMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const fromMock = vi.fn((table: string) => {
  if (table === "vendor_pro") {
    return { upsert: upsertMock };
  }
  if (table === "upgrade_requests") {
    return { update: () => ({ eq: updateEqMock }) };
  }
  return { insert: insertMock };
});
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from: fromMock })),
}));

import { resolveUpgradeRequest } from "@/app/admin/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const requestId = "22222222-2222-2222-2222-222222222222";
const vendorId = "11111111-1111-1111-1111-111111111111";

describe("resolveUpgradeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ user: { id: "admin-1" } });
    upsertMock.mockResolvedValue({ error: null });
    updateEqMock.mockResolvedValue({ error: null });
    insertMock.mockResolvedValue({ error: null });
  });

  it("grants Pro and resolves the request on success", async () => {
    const res = await resolveUpgradeRequest(form({ requestId, vendorId }));
    expect(res.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledWith(
      { vendor_id: vendorId },
      { onConflict: "vendor_id" },
    );
    expect(updateEqMock).toHaveBeenCalledWith("id", requestId);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: "admin-1",
        action: "resolve_upgrade_request",
        target_id: vendorId,
        detail: { requestId },
      }),
    );
  });

  it("returns 'Could not grant Pro' and never touches upgrade_requests when the grant fails", async () => {
    upsertMock.mockResolvedValue({ error: { message: "boom" } });
    const res = await resolveUpgradeRequest(form({ requestId, vendorId }));
    expect(res).toEqual({ success: false, error: "Could not grant Pro" });
    expect(updateEqMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns the partial-failure message when the grant succeeds but resolving fails", async () => {
    updateEqMock.mockResolvedValue({ error: { message: "boom" } });
    const res = await resolveUpgradeRequest(form({ requestId, vendorId }));
    expect(res).toEqual({
      success: false,
      error: "Granted Pro, but could not clear the request",
    });
    expect(upsertMock).toHaveBeenCalledWith(
      { vendor_id: vendorId },
      { onConflict: "vendor_id" },
    );
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid vendorId without writing", async () => {
    const res = await resolveUpgradeRequest(
      form({ requestId, vendorId: "nope" }),
    );
    expect(res.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateEqMock).not.toHaveBeenCalled();
  });

  it("rejects a non-uuid requestId without writing", async () => {
    const res = await resolveUpgradeRequest(
      form({ requestId: "nope", vendorId }),
    );
    expect(res.success).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(updateEqMock).not.toHaveBeenCalled();
  });
});
