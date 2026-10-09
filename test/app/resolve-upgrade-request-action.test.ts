import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  revalidate: vi.fn(),
  predicates: vi.fn(),
  readError: null as { message: string } | null,
  resolveError: null as { message: string } | null,
  resolveMissing: false,
  request: null as { id: string; vendor_id: string; status: string } | null,
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const from = vi.fn((table: string) => {
  if (table === "vendor_pro") return { upsert: mocks.upsert };
  if (table !== "upgrade_requests") return { insert: mocks.insert };
  const query = (write: boolean) => {
    const filters = new Map<string, string>();
    const chain = {
      eq(column: string, value: string) {
        filters.set(column, value);
        mocks.predicates(write ? "write" : "read", column, value);
        return chain;
      },
      select: () => chain,
      maybeSingle: async () => {
        const request = mocks.request;
        const matches =
          request &&
          [...filters].every(
            ([column, value]) =>
              request[column as keyof typeof request] === value,
          );
        return {
          data: matches && !(write && mocks.resolveMissing) ? request : null,
          error: write ? mocks.resolveError : mocks.readError,
        };
      },
    };
    return chain;
  };
  return {
    select: () => query(false),
    update: (value: unknown) => {
      mocks.update(value);
      return query(true);
    },
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ from })),
}));
import { resolveUpgradeRequest } from "@/app/admin/actions";

const requestId = "22222222-2222-2222-2222-222222222222";
const vendorId = "11111111-1111-1111-1111-111111111111";
function form(fields: Record<string, string> = { requestId, vendorId }) {
  const result = new FormData();
  for (const [key, value] of Object.entries(fields)) result.set(key, value);
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.readError = null;
  mocks.resolveError = null;
  mocks.resolveMissing = false;
  mocks.request = { id: requestId, vendor_id: vendorId, status: "pending" };
});
const noWrites = () => {
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
};
describe("resolveUpgradeRequest", () => {
  it("binds a pending request to its vendor before granting and resolving", async () => {
    expect(await resolveUpgradeRequest(form())).toEqual({ success: true });
    expect(mocks.upsert).toHaveBeenCalledWith(
      { vendor_id: vendorId },
      { onConflict: "vendor_id" },
    );
    for (const operation of ["read", "write"])
      for (const [column, value] of [
        ["id", requestId],
        ["vendor_id", vendorId],
        ["status", "pending"],
      ])
        expect(mocks.predicates).toHaveBeenCalledWith(operation, column, value);
    expect(mocks.update).toHaveBeenCalledWith({ status: "resolved" });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: "admin-1",
        action: "resolve_upgrade_request",
        target_id: vendorId,
        detail: { requestId, stage: "pro_granted" },
      }),
    );
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/vendors");
  });
  it.each(["missing", "mismatched vendor", "resolved"])(
    "rejects a %s request before all writes",
    async (kind) => {
      if (kind === "missing") mocks.request = null;
      else
        mocks.request = {
          id: requestId,
          vendor_id:
            kind === "mismatched vendor"
              ? "33333333-3333-3333-3333-333333333333"
              : vendorId,
          status: kind === "resolved" ? "resolved" : "pending",
        };
      expect(await resolveUpgradeRequest(form())).toEqual({
        success: false,
        error: "Pending upgrade request not found",
      });
      noWrites();
    },
  );
  it("fails closed on a request lookup error", async () => {
    mocks.readError = { message: "database unavailable" };
    expect(await resolveUpgradeRequest(form())).toEqual({
      success: false,
      error: "Could not load upgrade request",
    });
    noWrites();
  });
  it("does not resolve or audit when granting fails", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "boom" } });
    expect(await resolveUpgradeRequest(form())).toEqual({
      success: false,
      error: "Could not grant Pro",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each(["error", "no longer pending"])(
    "reports partial success on resolution %s",
    async (kind) => {
      if (kind === "error") mocks.resolveError = { message: "boom" };
      else mocks.resolveMissing = true;
      expect(await resolveUpgradeRequest(form())).toEqual({
        success: false,
        error: "Granted Pro, but could not clear the request",
      });
      expect(mocks.upsert).toHaveBeenCalledOnce();
      expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          target_id: vendorId,
          detail: { requestId, stage: "pro_granted" },
        }),
      );
      expect(mocks.revalidate).not.toHaveBeenCalled();
    },
  );
  it.each(["vendorId", "requestId"])(
    "rejects invalid %s before queries",
    async (key) => {
      expect(
        (
          await resolveUpgradeRequest(
            form({ requestId, vendorId, [key]: "nope" }),
          )
        ).success,
      ).toBe(false);
      expect(from).not.toHaveBeenCalled();
      noWrites();
    },
  );
  it("denies non-admin callers before privileged reads or writes", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
    await expect(resolveUpgradeRequest(form())).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(from).not.toHaveBeenCalled();
    noWrites();
  });
});
