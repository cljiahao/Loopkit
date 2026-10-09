import { beforeEach, describe, expect, it, vi } from "vitest";
const { get, set, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get, set, delete: remove })),
}));
import {
  readCustomerProof,
  saveCustomerProof,
  clearCustomerProof,
} from "./customer-proof";
const vendor = "91111111-1111-4111-8111-111111111111";
const token = "11111111111111111111111111111111";
beforeEach(() => vi.clearAllMocks());
describe("customer possession cookie", () => {
  it("clears only the selected vendor proof and rejects malformed cookie scope", async () => {
    get.mockReturnValue({ value: token });
    expect(await readCustomerProof(vendor)).toBe(token);
    remove.mockImplementation(() => get.mockReturnValue(undefined));
    await clearCustomerProof(vendor);
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      "loopkit_customer_" + vendor,
    );
    expect(await readCustomerProof(vendor)).toBeNull();
    await expect(clearCustomerProof("../other-cookie")).rejects.toThrow();
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it("does not accept malformed or missing cookies", async () => {
    get.mockReturnValue(undefined);
    expect(await readCustomerProof(vendor)).toBeNull();
    get.mockReturnValue({ value: "phone-only" });
    expect(await readCustomerProof(vendor)).toBeNull();
  });
  it("reads only the vendor scoped capability", async () => {
    get.mockReturnValue({ value: token });
    expect(await readCustomerProof(vendor)).toBe(token);
    expect(get).toHaveBeenCalledWith("loopkit_customer_" + vendor);
  });
  it("stores an opaque HttpOnly capability with bounded lifetime", async () => {
    await saveCustomerProof(vendor, token);
    expect(set).toHaveBeenCalledWith(
      "loopkit_customer_" + vendor,
      token,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 31536000,
      }),
    );
  });
  it("rejects invalid scope or token without setting any cookie", async () => {
    await expect(saveCustomerProof("invalid", token)).rejects.toThrow();
    await expect(saveCustomerProof(vendor, "invalid")).rejects.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});
