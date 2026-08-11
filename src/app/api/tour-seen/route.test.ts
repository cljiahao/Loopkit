import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, eqMock, updateMock, fromMock, createServerClientMock } =
  vi.hoisted(() => ({
    getUserMock: vi.fn(),
    eqMock: vi.fn(),
    updateMock: vi.fn(),
    fromMock: vi.fn(),
    createServerClientMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

beforeEach(() => {
  getUserMock.mockReset();
  eqMock.mockReset().mockResolvedValue({ error: null });
  updateMock.mockReset().mockReturnValue({ eq: eqMock });
  fromMock.mockReset().mockReturnValue({ update: updateMock });
  createServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: getUserMock },
    from: fromMock,
  });
});

describe("POST /api/tour-seen", () => {
  it("stamps tour_seen_at on the signed-in vendor's own row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "v1" } } });

    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(204);
    expect(fromMock).toHaveBeenCalledWith("vendors");
    expect(updateMock).toHaveBeenCalledWith({
      tour_seen_at: expect.any(String),
    });
    expect(eqMock).toHaveBeenCalledWith("vendor_id", "v1");
  });

  it("does nothing when no user is signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(204);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("logs but does not throw when the update fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "v1" } } });
    eqMock.mockResolvedValue({ error: { message: "RLS denied" } });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(204);
    expect(consoleError).toHaveBeenCalledWith(
      "markTourSeen failed",
      "RLS denied",
    );
    consoleError.mockRestore();
  });
});
