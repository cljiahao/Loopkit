import { describe, it, expect, vi, beforeEach } from "vitest";
const { rpc, readProof, saveProof } = vi.hoisted(() => ({
  rpc: vi.fn(),
  readProof: vi.fn(),
  saveProof: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({ rpc })),
}));
vi.mock("@/lib/customer-proof", async () => {
  const { z } = await import("zod");
  return {
    customerTokenSchema: z.string().regex(/^[a-f0-9]{32}$/),
    readCustomerProof: readProof,
    saveCustomerProof: saveProof,
  };
});
import { claimEarnAction } from "./actions";
const order = "00560000-0000-0000-0000-000000000100";
const vendor = "00560000-0000-0000-0000-000000000001";
const token = "a".repeat(32);
function form(overrides: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    order,
    phone: "91234567",
    name: "Tan",
    ...overrides,
  }))
    if (value !== undefined) data.set(key, value);
  return data;
}
const result = {
  vendor_id: vendor,
  card_token: token,
  stamp_count: 4,
  stamps_required: 10,
  reward_text: "Free coffee",
};
beforeEach(() => {
  vi.resetAllMocks();
  readProof.mockResolvedValue(null);
  saveProof.mockResolvedValue(undefined);
});
describe("claimEarnAction capability boundary", () => {
  it.each([
    { order: "bad" },
    { phone: "123" },
    { name: "x".repeat(101) },
    { token: "bad" },
  ])("rejects invalid input before DB", async (input) => {
    expect(
      (await claimEarnAction({ status: "idle" }, form(input))).status,
    ).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects unknown orders before reading a cookie", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await claimEarnAction({ status: "idle" }, form())).status).toBe(
      "error",
    );
    expect(readProof).not.toHaveBeenCalled();
  });
  it("allows a new enrollment and stores only its returned proof in the cookie", async () => {
    rpc
      .mockResolvedValueOnce({ data: vendor, error: null })
      .mockResolvedValueOnce({ data: result, error: null });
    const state = await claimEarnAction({ status: "idle" }, form());
    expect(state).toEqual({
      status: "success",
      stampCount: 4,
      stampsRequired: 10,
      rewardText: "Free coffee",
    });
    expect(rpc).toHaveBeenLastCalledWith("customer_qkit_earn_claim", {
      p_order_id: order,
      p_phone: "+6591234567",
      p_name: "Tan",
      p_token: null,
    });
    expect(saveProof).toHaveBeenCalledWith(vendor, token);
    expect(JSON.stringify(state)).not.toContain(token);
  });
  it("uses vendor-scoped saved proof for an existing card", async () => {
    readProof.mockResolvedValue(token);
    rpc
      .mockResolvedValueOnce({ data: vendor, error: null })
      .mockResolvedValueOnce({ data: result, error: null });
    expect((await claimEarnAction({ status: "idle" }, form())).status).toBe(
      "success",
    );
    expect(readProof).toHaveBeenCalledWith(vendor);
    expect(rpc).toHaveBeenLastCalledWith(
      "customer_qkit_earn_claim",
      expect.objectContaining({ p_token: token }),
    );
  });
  it("accepts manually recovered proof without trusting a browser-supplied vendor", async () => {
    rpc
      .mockResolvedValueOnce({ data: vendor, error: null })
      .mockResolvedValueOnce({ data: result, error: null });
    expect(
      (await claimEarnAction({ status: "idle" }, form({ token }))).status,
    ).toBe("success");
    expect(readProof).not.toHaveBeenCalled();
  });
  it("maps unauthorized existing or replay claims to recovery without exposing DB details", async () => {
    rpc
      .mockResolvedValueOnce({ data: vendor, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "victim phone and token details" },
      });
    const state = await claimEarnAction({ status: "idle" }, form());
    expect(state.status).toBe("error");
    expect(state.message).toContain("recover your card");
    expect(JSON.stringify(state)).not.toContain("victim");
    expect(saveProof).not.toHaveBeenCalled();
  });
  it.each([
    { ...result, vendor_id: "00560000-0000-0000-0000-000000000002" },
    { ...result, card_token: "bad" },
    { ...result, stamp_count: -1 },
    null,
  ])("fails closed on unexpected response", async (data) => {
    rpc
      .mockResolvedValueOnce({ data: vendor, error: null })
      .mockResolvedValueOnce({ data, error: null });
    expect((await claimEarnAction({ status: "idle" }, form())).status).toBe(
      "error",
    );
    expect(saveProof).not.toHaveBeenCalled();
  });
  it("allows retry after a transport rejection", async () => {
    rpc.mockRejectedValueOnce(new Error("transport"));
    expect((await claimEarnAction({ status: "idle" }, form())).status).toBe(
      "error",
    );
    rpc
      .mockResolvedValueOnce({ data: vendor, error: null })
      .mockResolvedValueOnce({ data: result, error: null });
    expect((await claimEarnAction({ status: "idle" }, form())).status).toBe(
      "success",
    );
  });
  it("reports cookie-save rejection without disclosing the capability", async () => {
    rpc
      .mockResolvedValueOnce({ data: vendor, error: null })
      .mockResolvedValueOnce({ data: result, error: null });
    saveProof.mockRejectedValueOnce(new Error("cookie unavailable"));
    expect((await claimEarnAction({ status: "idle" }, form())).status).toBe(
      "error",
    );
  });
});
