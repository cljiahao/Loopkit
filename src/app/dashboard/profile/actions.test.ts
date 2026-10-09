import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getUserMock,
  getOrCreateVendorProfileMock,
  patchVendorProfileMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  getOrCreateVendorProfileMock: vi.fn(),
  patchVendorProfileMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));
vi.mock("@/lib/merqo-vendor-profile", () => ({
  getOrCreateVendorProfile: getOrCreateVendorProfileMock,
  patchVendorProfile: patchVendorProfileMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/vendor", () => ({ saveStallName: vi.fn() }));

import { updateSocialLinksAction } from "./actions";

describe("updateSocialLinksAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "v1" } } });
    getOrCreateVendorProfileMock.mockResolvedValue({
      vendor_id: "v1",
      stall_name: "Kopi Corner",
      social_links: {},
      created_at: "",
      updated_at: "",
    });
  });

  it("saves valid links, preserving the existing stall name", async () => {
    const res = await updateSocialLinksAction({
      website: "https://kopicorner.com",
      instagram: "https://instagram.com/kopicorner",
    });

    expect(res.error).toBeUndefined();
    expect(getOrCreateVendorProfileMock).not.toHaveBeenCalled();
    expect(patchVendorProfileMock).toHaveBeenCalledWith(
      expect.anything(),
      "v1",
      {
        socialLinks: {
          website: "https://kopicorner.com",
          instagram: "https://instagram.com/kopicorner",
        },
      },
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/profile");
  });

  it("rejects an invalid URL without calling patchVendorProfile", async () => {
    const res = await updateSocialLinksAction({ website: "not-a-url" });

    expect(res.error).toBe(
      "Enter a valid URL, e.g. https://instagram.com/yourstall",
    );
    expect(patchVendorProfileMock).not.toHaveBeenCalled();
  });

  it("returns an error when not signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await updateSocialLinksAction({});

    expect(res.error).toBe("Not signed in");
    expect(patchVendorProfileMock).not.toHaveBeenCalled();
  });

  it("returns an error and does not revalidate when patchVendorProfile fails", async () => {
    patchVendorProfileMock.mockRejectedValueOnce(new Error("db down"));

    const res = await updateSocialLinksAction({
      website: "https://kopicorner.com",
    });

    expect(res.error).toBe("Could not save links");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
