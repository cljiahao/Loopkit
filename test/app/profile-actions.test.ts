import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock, saveStallNameMock } = vi.hoisted(() => ({
  requireVendorMock: vi.fn(async () => ({ user: { id: "vendor-1" } })),
  saveStallNameMock: vi.fn(async () => ({})),
}));
vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/vendor", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/vendor")>();
  return { ...actual, saveStallName: saveStallNameMock };
});

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  patchVendorProfile: patchMock,
  getOrCreateVendorProfile: vi.fn(),
}));
const updateUserMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: {
      updateUser: updateUserMock,
      getUser: async () => ({ data: { user: { id: "vendor-1" } } }),
    },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  updateStallNameAction,
  updatePasswordAction,
} from "@/app/dashboard/profile/actions";

beforeEach(() => {
  // Clears call history only (not the default implementations set above via
  // vi.fn(impl)) — each test starts from a clean "not yet called" baseline.
  vi.clearAllMocks();
});

describe("updateStallNameAction", () => {
  it("delegates to saveStallName", async () => {
    const res = await updateStallNameAction("Kopi Corner");
    expect(saveStallNameMock).toHaveBeenCalledWith("Kopi Corner");
    expect(res.error).toBeUndefined();
  });
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

describe("social URL protocol boundary", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///tmp/profile",
  ])("rejects %s before database access", async (website) => {
    const { updateSocialLinksAction } =
      await import("@/app/dashboard/profile/actions");
    const result = await updateSocialLinksAction({ website });
    expect(result.error).toBeDefined();
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });
});

it("saves social links without reading or rewriting the stall name", async () => {
  patchMock.mockResolvedValue({});
  const { updateSocialLinksAction } =
    await import("@/app/dashboard/profile/actions");
  expect(
    await updateSocialLinksAction({ website: "https://example.com" }),
  ).toEqual({});
  expect(patchMock).toHaveBeenCalledWith(expect.anything(), "vendor-1", {
    socialLinks: { website: "https://example.com" },
  });
});
