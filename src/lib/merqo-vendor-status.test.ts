import { describe, it, expect } from "vitest";
import { resolveVendorStatus } from "./merqo-vendor-status";

const authUsers = [
  { id: "u1", email: "alice@example.com" },
  { id: "u2", email: "BOB@Example.com" },
];

describe("resolveVendorStatus", () => {
  it("active (free) when the vendor owns a program but isn't in vendor_pro", () => {
    const r = resolveVendorStatus("alice@example.com", authUsers, ["u1"], []);
    expect(r).toEqual({ active: true, plan: "free" });
  });

  it("active (pro) when the vendor owns a program and is in vendor_pro", () => {
    const r = resolveVendorStatus(
      "alice@example.com",
      authUsers,
      ["u1"],
      ["u1"],
    );
    expect(r).toEqual({ active: true, plan: "pro" });
  });

  it("matches email case-insensitively", () => {
    const r = resolveVendorStatus("bob@example.com", authUsers, ["u2"], []);
    expect(r).toEqual({ active: true, plan: "free" });
  });

  it("inactive when no auth user matches the email", () => {
    const r = resolveVendorStatus(
      "nobody@example.com",
      authUsers,
      ["u1"],
      ["u1"],
    );
    expect(r).toEqual({ active: false, plan: null });
  });

  it("inactive when the auth user exists but owns no program", () => {
    const r = resolveVendorStatus("alice@example.com", authUsers, [], []);
    expect(r).toEqual({ active: false, plan: null });
  });
});
