import { beforeEach, describe, expect, it, vi } from "vitest";
const { clear } = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock("@/lib/customer-proof", async () => {
  const { z } = await import("zod");
  return { vendorIdSchema: z.string().uuid(), clearCustomerProof: clear };
});
import { forgetCustomerProof } from "./customer-proof-actions";
const vendor = "91111111-1111-4111-8111-111111111111";
beforeEach(() => vi.clearAllMocks());
describe("forget this browser's customer proof", () => {
  it("validates scope before clearing and does not access any database", async () => {
    expect(await forgetCustomerProof("../session")).toEqual({
      success: false,
      error: "Invalid shop.",
    });
    expect(clear).not.toHaveBeenCalled();
    expect(await forgetCustomerProof(vendor)).toEqual({ success: true });
    expect(clear).toHaveBeenCalledExactlyOnceWith(vendor);
  });
  it("reports cookie transport failures without claiming proof was forgotten", async () => {
    clear.mockRejectedValueOnce(new Error("cookie store"));
    expect(await forgetCustomerProof(vendor)).toEqual({
      success: false,
      error: "Could not forget this saved card. Try again.",
    });
  });
});
