import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, apply } = vi.hoisted(() => ({ rpc: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: async () => ({ rpc }),
}));
vi.mock("@/lib/engine", () => ({ applyVisit: apply }));
import { completeReferralCredit } from "./referral-credit";
const snapshot = (growth = 0) => ({
  program: {
    type: "plant",
    config: {
      stages: [
        { name: "Seed", threshold: 0 },
        { name: "Tree", threshold: 100 },
      ],
      growth_per_visit: 1,
      grace_days: 3650,
      decay_rate: 0,
      floor_growth: 0,
      reward_text: "Coffee",
    },
    stamps_required: 8,
    reward_text: "Coffee",
  },
  card: {
    state: { growth, last_visit_at: null, blooms: 0 },
    stamp_count: 0,
    reward_count: 0,
    updated_at: "2026-10-08T00:00:00Z",
  },
});
beforeEach(async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/engine")>("@/lib/engine");
  rpc.mockReset();
  apply.mockReset().mockImplementation(actual.applyVisit);
});
describe("referral compare and swap", () => {
  it("recomputes competing credits from the latest state without losing either", async () => {
    let visits = 0;
    let conflicts = 0;
    const consumed = new Set<string>();
    rpc.mockImplementation(
      async (
        name: string,
        args: {
          p_guest_phone: string;
          p_expected?: ReturnType<typeof snapshot>;
          p_state?: { growth: number };
        },
      ) => {
        if (name === "referral_credit_snapshot")
          return {
            data: consumed.has(args.p_guest_phone) ? null : snapshot(visits),
            error: null,
          };
        if (consumed.has(args.p_guest_phone))
          return { data: true, error: null };
        if (args.p_expected?.card.state.growth !== visits) {
          conflicts++;
          return { data: false, error: null };
        }
        visits = args.p_state!.growth;
        consumed.add(args.p_guest_phone);
        return { data: true, error: null };
      },
    );
    await Promise.all([
      completeReferralCredit("h", "guest-a"),
      completeReferralCredit("h", "guest-b"),
    ]);
    expect(visits).toBe(2);
    expect(consumed.size).toBe(2);
    expect(conflicts).toBe(1);
    const rolls = apply.mock.calls.map((call) => call[2].payload.roll);
    expect(rolls[2]).toBe(rolls[1]);
  });
  it("does not recompute an already credited reservation", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await completeReferralCredit("h", "guest");
    expect(apply).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("treats a concurrently completed reservation as success", async () => {
    rpc
      .mockResolvedValueOnce({ data: snapshot(), error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    await expect(completeReferralCredit("h", "guest")).resolves.toBeUndefined();
  });
  it("leaves a repeatedly contended reservation pending after bounded retries", async () => {
    rpc.mockImplementation(async (name: string) => ({
      data: name === "referral_credit_snapshot" ? snapshot() : false,
      error: null,
    }));
    await expect(completeReferralCredit("h", "guest")).rejects.toThrow(
      "next referral join",
    );
    expect(rpc).toHaveBeenCalledTimes(6);
    expect(apply).toHaveBeenCalledTimes(3);
  });
  it("rejects missing card state without submitting a transition", async () => {
    rpc.mockResolvedValue({
      data: {
        program: snapshot().program,
        card: { stamp_count: 0, reward_count: 0, updated_at: "now" },
      },
      error: null,
    });
    await expect(completeReferralCredit("h", "guest")).rejects.toThrow();
    expect(apply).not.toHaveBeenCalled();
  });
  it.each(["snapshot", "commit"])(
    "propagates %s returned errors for safe logging",
    async (stage) => {
      rpc.mockImplementation(async (name: string) =>
        name === "referral_credit_snapshot" && stage === "commit"
          ? { data: snapshot(), error: null }
          : { data: null, error: { message: "offline" } },
      );
      await expect(completeReferralCredit("h", "guest")).rejects.toThrow(
        "offline",
      );
    },
  );
  it("propagates network rejection without consuming the reservation", async () => {
    rpc.mockRejectedValue(new Error("offline"));
    await expect(completeReferralCredit("h", "guest")).rejects.toThrow(
      "offline",
    );
  });
  it("does not accept a null commit result as applied", async () => {
    rpc
      .mockResolvedValueOnce({ data: snapshot(), error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    await expect(completeReferralCredit("h", "guest")).rejects.toThrow(
      "Invalid referral commit response",
    );
  });
});
