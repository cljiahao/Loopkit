import { describe, it, expect } from "vitest";
import { computeVendorActivity } from "./merqo-vendor-activity";

const NOW = Date.parse("2026-08-27T00:00:00Z");
const days = (n: number) =>
  new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

describe("computeVendorActivity", () => {
  it("is inactive with empty fields when the vendor has no programs", () => {
    const r = computeVendorActivity(false, [], [], [], NOW);
    expect(r).toEqual({
      active: false,
      plan: null,
      status: null,
      metrics: [],
      lastActivityAt: null,
    });
  });

  it("computes metrics for a free vendor with activity", () => {
    const programs = [{ id: "p1" }, { id: "p2" }];
    const cards = [{ id: "c1" }, { id: "c2" }];
    const events = [
      { card_id: "c1", kind: "stamp", created_at: days(1) },
      { card_id: "c1", kind: "stamp", created_at: days(2) },
      { card_id: "c2", kind: "redeem", created_at: days(3) },
      // outside the 30d window — must not count toward the 30d metrics
      { card_id: "c1", kind: "stamp", created_at: days(40) },
      // not a customer action — excluded from lastActivityAt
      { card_id: "c2", kind: "regen", created_at: days(0) },
    ];

    const r = computeVendorActivity(false, programs, cards, events, NOW);

    expect(r.active).toBe(true);
    expect(r.plan).toBe("free");
    expect(r.status).toBeNull();
    expect(r.metrics).toEqual([
      { label: "Programs", value: "2" },
      { label: "Cards", value: "2" },
      { label: "Stamps (30d)", value: "2" },
      { label: "Rewards redeemed (30d)", value: "1" },
    ]);
    // most recent non-regen event is the day-1 stamp (day 0 is the excluded regen)
    expect(r.lastActivityAt).toBe(days(1));
  });

  it("reports plan pro when the vendor is in vendor_pro", () => {
    const r = computeVendorActivity(true, [{ id: "p1" }], [], [], NOW);
    expect(r.plan).toBe("pro");
  });

  it("lastActivityAt is null when there are cards but no events", () => {
    const r = computeVendorActivity(
      false,
      [{ id: "p1" }],
      [{ id: "c1" }],
      [],
      NOW,
    );
    expect(r.lastActivityAt).toBeNull();
    expect(r.metrics).toEqual([
      { label: "Programs", value: "1" },
      { label: "Cards", value: "1" },
      { label: "Stamps (30d)", value: "0" },
      { label: "Rewards redeemed (30d)", value: "0" },
    ]);
  });
});
