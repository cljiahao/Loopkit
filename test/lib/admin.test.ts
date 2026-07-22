import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromMock, getUserMock, notFoundMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    from: fromMock,
    auth: { getUser: getUserMock },
  })),
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));

import { isAdmin, requireAdmin } from "@/lib/admin";

function builder(data: unknown) {
  const b: Record<string, unknown> = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    maybeSingle: () => Promise.resolve({ data, error: null }),
  };
  return b;
}

describe("isAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("true when the admins table returns a row", async () => {
    fromMock.mockReturnValue(builder({ user_id: "u1" }));
    expect(await isAdmin("u1")).toBe(true);
  });

  it("false when the admins table returns no row (RLS hides it from a non-admin)", async () => {
    fromMock.mockReturnValue(builder(null));
    expect(await isAdmin("u1")).toBe(false);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the user when signed in and an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue(builder({ user_id: "u1" }));

    const result = await requireAdmin();

    expect(result).toEqual({ user: { id: "u1" } });
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("404s when signed out", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when signed in but not an admin", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    fromMock.mockReturnValue(builder(null));
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
