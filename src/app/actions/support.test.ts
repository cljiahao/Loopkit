import { describe, it, expect, vi, beforeEach } from "vitest";

const { getUserMock, rpcMock, schemaMock, createServerClientMock } = vi.hoisted(
  () => ({
    getUserMock: vi.fn(),
    rpcMock: vi.fn(),
    schemaMock: vi.fn(),
    createServerClientMock: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: createServerClientMock,
}));

beforeEach(() => {
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: "v1" } } });
  rpcMock.mockReset().mockResolvedValue({ data: { id: "msg1" }, error: null });
  schemaMock.mockReset().mockReturnValue({ rpc: rpcMock });
  createServerClientMock.mockReset().mockResolvedValue({
    auth: { getUser: getUserMock },
    schema: schemaMock,
  });
});

describe("submitSupportMessageAction", () => {
  it("calls the RPC with loopkit's kit slug, category, and body", async () => {
    const { submitSupportMessageAction } = await import("./support");
    const result = await submitSupportMessageAction({
      category: "program",
      body: "Stamps aren't crediting.",
    });
    expect(result).toEqual({ success: true });
    expect(rpcMock).toHaveBeenCalledWith("submit_support_message", {
      p_kit_slug: "loopkit",
      p_category: "program",
      p_body: "Stamps aren't crediting.",
    });
  });

  it("returns an error for an empty body without calling the RPC", async () => {
    const { submitSupportMessageAction } = await import("./support");
    const result = await submitSupportMessageAction({
      category: "program",
      body: "",
    });
    expect(result.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns an error without redirecting when there's no session", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { submitSupportMessageAction } = await import("./support");
    const result = await submitSupportMessageAction({
      category: "program",
      body: "Help",
    });
    expect(result).toEqual({
      success: false,
      error: "Please sign in first",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("surfaces a friendly error when the RPC fails", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });
    const { submitSupportMessageAction } = await import("./support");
    const result = await submitSupportMessageAction({
      category: "program",
      body: "Help",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toMatch(/connection reset/);
    }
  });
});
