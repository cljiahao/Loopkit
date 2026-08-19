import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, createServerClientMock, stampTourSeenMock } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    createServerClientMock: vi.fn(),
    stampTourSeenMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("@/lib/tour-prefs", () => ({
  stampTourSeen: stampTourSeenMock,
}));

beforeEach(() => {
  getUserMock.mockReset();
  stampTourSeenMock.mockReset().mockResolvedValue(undefined);
  createServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: getUserMock },
  });
});

describe("POST /api/tour-seen", () => {
  it("stamps tour_seen_at on the signed-in vendor's own row", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "v1" } } });

    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(204);
    expect(stampTourSeenMock).toHaveBeenCalledWith(expect.anything(), "v1");
  });

  it("does nothing when no user is signed in", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { POST } = await import("./route");
    const res = await POST();

    expect(res.status).toBe(204);
    expect(stampTourSeenMock).not.toHaveBeenCalled();
  });
});
