import { describe, it, expect } from "vitest";
import { dollarsToCents, centsToDollars, formatSgd } from "@/lib/money";

describe("dollarsToCents", () => {
  it("converts and rounds to the nearest cent", () => {
    expect(dollarsToCents(1.2)).toBe(120);
    // 1.005 * 100 is 100.4999... in IEEE 754, so Math.round gives 100. The
    // form step is 0.01 and users type at most 2 decimals, so this is fine.
    expect(dollarsToCents(1.005)).toBe(100);
  });
  it("handles zero and whole dollars", () => {
    expect(dollarsToCents(0)).toBe(0);
    expect(dollarsToCents(3)).toBe(300);
  });
});

describe("centsToDollars", () => {
  it("is the inverse for whole cents", () => {
    expect(centsToDollars(120)).toBeCloseTo(1.2, 10);
    expect(centsToDollars(0)).toBe(0);
  });
});

describe("formatSgd", () => {
  it("always shows two decimal places with a leading $", () => {
    expect(formatSgd(120)).toBe("$1.20");
    expect(formatSgd(0)).toBe("$0.00");
    expect(formatSgd(1050)).toBe("$10.50");
  });
});
