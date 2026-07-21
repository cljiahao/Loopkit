import { describe, it, expect, vi, beforeEach } from "vitest";

// updateStallNameAction's own coverage (shared merqo.vendor_profile RPC
// write path) lives in src/app/dashboard/profile/actions.test.ts, colocated
// with the mocks for getOrCreateVendorProfile/upsertVendorProfile — this
// file only covers updatePasswordAction.
const updateUserMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { updateUser: updateUserMock },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePasswordAction } from "@/app/dashboard/profile/actions";

beforeEach(() => {
  // Clears call history only (not the default implementations set above via
  // vi.fn(impl)) — each test starts from a clean "not yet called" baseline.
  vi.clearAllMocks();
});

describe("updatePasswordAction", () => {
  it("calls supabase.auth.updateUser with the new password", async () => {
    const res = await updatePasswordAction("newpassword123");
    expect(updateUserMock).toHaveBeenCalledWith({ password: "newpassword123" });
    expect(res.error).toBeUndefined();
  });

  it("rejects a password under 8 characters without calling Supabase", async () => {
    const res = await updatePasswordAction("short");
    expect(res.error).toBeDefined();
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
