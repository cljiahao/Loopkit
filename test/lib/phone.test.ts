import { describe, it, expect } from "vitest";
import { normalizePhone, maskPhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    ["91234567", "+6591234567"],
    ["+65 9123 4567", "+6591234567"],
    ["6591234567", "+6591234567"],
    ["8123-4567", "+6581234567"],
  ])("normalizes %s", (raw, out) => {
    expect(normalizePhone(raw)).toEqual({ ok: true, phone: out });
  });
  it.each(["123", "0123456789", "12345678", "abc", ""])("rejects %s", (raw) =>
    expect(normalizePhone(raw)).toEqual({ ok: false }),
  );
});

describe("maskPhone", () => {
  it("keeps the first 4 local digits and masks the rest", () => {
    expect(maskPhone("+6591234567")).toBe("9123 ****");
    expect(maskPhone("91234567")).toBe("9123 ****");
  });

  it("returns the input unchanged when it is too short to mask", () => {
    expect(maskPhone("123")).toBe("123");
  });
});
