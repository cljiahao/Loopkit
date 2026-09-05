import { describe, it, expect, vi, beforeEach } from "vitest";

const { redirectMock, getUserMock, requireCurrentLegalAcceptanceMock } =
  vi.hoisted(() => ({
    redirectMock: vi.fn((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    }),
    getUserMock: vi.fn(),
    requireCurrentLegalAcceptanceMock: vi.fn(),
  }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));
vi.mock("@/lib/legal-gate", () => ({
  requireCurrentLegalAcceptance: requireCurrentLegalAcceptanceMock,
}));

import { requireVendor } from "@/features/auth/api/require-vendor";

describe("requireVendor", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    getUserMock.mockClear();
    requireCurrentLegalAcceptanceMock.mockReset();
    requireCurrentLegalAcceptanceMock.mockResolvedValue(undefined);
  });

  it("returns the user without redirecting when a session exists", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "vendor-1", email: "vendor@example.com" } },
    });
    const result = await requireVendor();
    expect(result).toEqual({
      user: { id: "vendor-1", email: "vendor@example.com" },
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login and never resolves a user when unauthenticated", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(requireVendor()).rejects.toThrow("REDIRECT:/login");
    expect(requireCurrentLegalAcceptanceMock).not.toHaveBeenCalled();
  });

  it("passes the signed-in vendor's email through the legal-acceptance gate", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "vendor-1", email: "vendor@example.com" } },
    });

    await requireVendor();

    expect(requireCurrentLegalAcceptanceMock).toHaveBeenCalledWith(
      "vendor@example.com",
    );
  });

  it("bounces to /legal/accept when the gate redirects (stale acceptance)", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "vendor-1", email: "vendor@example.com" } },
    });
    requireCurrentLegalAcceptanceMock.mockRejectedValue(
      new Error("REDIRECT:/legal/accept"),
    );

    await expect(requireVendor()).rejects.toThrow("REDIRECT:/legal/accept");
  });
});
