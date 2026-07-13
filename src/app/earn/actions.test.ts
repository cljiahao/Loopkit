import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));
vi.mock("@/lib/rate-limit", () => ({
  allowRequest: vi.fn().mockResolvedValue(true),
}));

import { claimEarnAction } from "./actions";

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

describe("claimEarnAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid phone", async () => {
    const result = await claimEarnAction(
      { status: "idle" },
      fd({ order: "o1", phone: "123", name: "" }),
    );
    expect(result.status).toBe("error");
  });

  it("rejects when the order lookup finds nothing", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const result = await claimEarnAction(
      { status: "idle" },
      fd({ order: "o1", phone: "91234567", name: "Tan" }),
    );
    expect(result.status).toBe("error");
    expect(rpcMock).toHaveBeenCalledWith(
      "qkit_earn_lookup",
      expect.objectContaining({ p_order_id: "o1" }),
    );
  });

  it("commits for a stamp-type program and returns the new count", async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: [
          {
            vendor_id: "v1",
            program_id: "p1",
            program_type: "stamp",
            program_config: {},
            stamps_required: 10,
            reward_text: "Free coffee",
            already_claimed: false,
            card_state: {},
            card_stamp_count: 3,
            card_reward_count: 0,
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "c1", stamp_count: 4, state: {} },
        error: null,
      });

    const result = await claimEarnAction(
      { status: "idle" },
      fd({ order: "o1", phone: "91234567", name: "Tan" }),
    );

    expect(result.status).toBe("success");
    expect(result.stampCount).toBe(4);
    expect(rpcMock).toHaveBeenLastCalledWith(
      "qkit_earn_commit",
      expect.objectContaining({ p_order_id: "o1", p_stamp_count: 4 }),
    );
  });

  it("shows already-claimed without re-committing", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          vendor_id: "v1",
          program_id: "p1",
          program_type: "stamp",
          program_config: {},
          stamps_required: 10,
          reward_text: "Free coffee",
          already_claimed: true,
          card_state: {},
          card_stamp_count: 4,
          card_reward_count: 0,
        },
      ],
      error: null,
    });

    const result = await claimEarnAction(
      { status: "idle" },
      fd({ order: "o1", phone: "91234567", name: "Tan" }),
    );

    expect(result.status).toBe("success");
    expect(result.stampCount).toBe(4);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-stamp program (out of MVP scope)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          vendor_id: "v1",
          program_id: "p1",
          program_type: "plant",
          program_config: {},
          stamps_required: 10,
          reward_text: "Free coffee",
          already_claimed: false,
          card_state: {},
          card_stamp_count: 0,
          card_reward_count: 0,
        },
      ],
      error: null,
    });

    const result = await claimEarnAction(
      { status: "idle" },
      fd({ order: "o1", phone: "91234567", name: "Tan" }),
    );

    expect(result.status).toBe("error");
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});
