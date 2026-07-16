import { describe, it, expect } from "vitest";
import {
  oldestActiveVoucher,
  isPastExpiry,
  daysUntilExpiry,
  countJustExpired,
  type VoucherRow,
} from "@/lib/vouchers";

function voucher(overrides: Partial<VoucherRow>): VoucherRow {
  return {
    id: "v1",
    reward_text: "Free kopi",
    earned_at: "2026-07-01T00:00:00Z",
    expires_at: null,
    redeemed_at: null,
    status: "active",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("oldestActiveVoucher", () => {
  it("returns the earliest-earned active voucher", () => {
    const vouchers = [
      voucher({ id: "v2", earned_at: "2026-07-05T00:00:00Z" }),
      voucher({ id: "v1", earned_at: "2026-07-01T00:00:00Z" }),
    ];
    expect(oldestActiveVoucher(vouchers)?.id).toBe("v1");
  });

  it("ignores redeemed and expired vouchers", () => {
    const vouchers = [
      voucher({ id: "v1", status: "redeemed" }),
      voucher({ id: "v2", status: "expired" }),
    ];
    expect(oldestActiveVoucher(vouchers)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(oldestActiveVoucher([])).toBeNull();
  });
});

describe("isPastExpiry", () => {
  it("is false when expires_at is null (never expires)", () => {
    expect(
      isPastExpiry(voucher({ expires_at: null }), new Date("2026-08-01")),
    ).toBe(false);
  });

  it("is true once now is at/after expires_at", () => {
    expect(
      isPastExpiry(
        voucher({ expires_at: "2026-07-10T00:00:00Z" }),
        new Date("2026-07-10T00:00:01Z"),
      ),
    ).toBe(true);
  });

  it("is false before expires_at", () => {
    expect(
      isPastExpiry(
        voucher({ expires_at: "2026-07-10T00:00:00Z" }),
        new Date("2026-07-09T00:00:00Z"),
      ),
    ).toBe(false);
  });
});

describe("daysUntilExpiry", () => {
  it("rounds up to whole days", () => {
    expect(
      daysUntilExpiry("2026-07-12T00:00:00Z", new Date("2026-07-10T00:00:00Z")),
    ).toBe(2);
  });

  it("floors at 0 for a past date", () => {
    expect(
      daysUntilExpiry("2026-07-01T00:00:00Z", new Date("2026-07-10T00:00:00Z")),
    ).toBe(0);
  });
});

describe("countJustExpired", () => {
  it("counts only expired vouchers updated at/after the given timestamp", () => {
    const vouchers = [
      voucher({
        id: "v1",
        status: "expired",
        updated_at: "2026-07-10T10:00:00Z",
      }),
      voucher({
        id: "v2",
        status: "expired",
        updated_at: "2026-07-01T00:00:00Z",
      }),
      voucher({
        id: "v3",
        status: "active",
        updated_at: "2026-07-10T10:00:00Z",
      }),
    ];
    expect(countJustExpired(vouchers, "2026-07-10T09:00:00Z")).toBe(1);
  });
});
