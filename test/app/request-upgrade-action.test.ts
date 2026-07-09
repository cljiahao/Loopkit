import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, maybeSingleMock, insertMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  insertMock: vi.fn(),
}));

const limitMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const statusEqMock = vi.fn(() => ({ limit: limitMock }));
const vendorEqMock = vi.fn(() => ({ eq: statusEqMock }));
const selectMock = vi.fn(() => ({ eq: vendorEqMock }));

const fromMock = vi.fn(() => ({
  select: selectMock,
  insert: insertMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}));

import { requestUpgrade } from "@/app/dashboard/plan/actions";

const vendorId = "11111111-1111-1111-1111-111111111111";

describe("requestUpgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: vendorId } } });
    maybeSingleMock.mockResolvedValue({ data: null });
    insertMock.mockResolvedValue({ error: null });
  });

  it("inserts a new upgrade request when none is pending", async () => {
    const res = await requestUpgrade();

    expect(res).toEqual({ success: true });
    expect(fromMock).toHaveBeenCalledWith("upgrade_requests");
    expect(selectMock).toHaveBeenCalledWith("id");
    expect(vendorEqMock).toHaveBeenCalledWith("vendor_id", vendorId);
    expect(statusEqMock).toHaveBeenCalledWith("status", "pending");
    expect(insertMock).toHaveBeenCalledWith({ vendor_id: vendorId });
  });

  it("is idempotent: does not insert when a pending request already exists", async () => {
    maybeSingleMock.mockResolvedValue({ data: { id: "req-1" } });

    const res = await requestUpgrade();

    expect(res).toEqual({ success: true });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("fails without querying upgrade_requests when no user is signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await requestUpgrade();

    expect(res).toEqual({ success: false, error: "Please sign in first" });
    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
