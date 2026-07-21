import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, insertMock, fromMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  insertMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}));

import { submitFeedbackAction } from "./feedback";

describe("submitFeedbackAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "v1" } } });
    fromMock.mockReturnValue({ insert: insertMock });
    insertMock.mockResolvedValue({ error: null });
  });

  it("inserts and succeeds with valid input", async () => {
    const res = await submitFeedbackAction({ nps: 9, message: "Great!" });

    expect(res).toEqual({ success: true });
    expect(fromMock).toHaveBeenCalledWith("feedback");
    expect(insertMock).toHaveBeenCalledWith({
      vendor_id: "v1",
      nps: 9,
      message: "Great!",
    });
  });

  it("rejects an out-of-range nps before calling Supabase", async () => {
    const res = await submitFeedbackAction({ nps: 11 });

    expect(res.success).toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const res = await submitFeedbackAction({ nps: 5 });

    expect(res).toEqual({ success: false, error: "Please sign in first" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("surfaces a Supabase insert error", async () => {
    insertMock.mockResolvedValue({ error: { message: "db down" } });

    const res = await submitFeedbackAction({ nps: 5 });

    expect(res).toEqual({ success: false, error: "Could not send feedback" });
  });
});
