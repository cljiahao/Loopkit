import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/phone";

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
