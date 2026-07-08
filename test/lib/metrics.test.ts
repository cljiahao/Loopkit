import { describe, it, expect } from "vitest";
import { computeLoopkitMetrics } from "@/lib/metrics";

const DAY = 24 * 60 * 60 * 1000;

describe("computeLoopkitMetrics", () => {
  const now = Date.UTC(2026, 6, 7);
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

  it("maps programs/cards/stamp events onto the merqo shape", () => {
    const m = computeLoopkitMetrics({
      nowMs: now,
      programs: [
        { id: "p1", active: true, created_at: iso(2) },
        { id: "p2", active: false, created_at: iso(40) },
      ],
      cards: [
        { id: "c1", program_id: "p1" },
        { id: "c2", program_id: "p2" },
      ],
      stampEvents: [
        // p1: one stamp 1d ago (7d window), one stamp 10d ago (prev-7d window)
        { card_id: "c1", kind: "stamp", created_at: iso(1) },
        { card_id: "c1", kind: "stamp", created_at: iso(10) },
        // p2: a redeem 3d ago — no stamps for p2
        { card_id: "c2", kind: "redeem", created_at: iso(3) },
      ],
    });

    expect(m.total_vendors).toBe(2);
    expect(m.active_vendors).toBe(1);
    expect(m.signups_7d).toBe(1); // only p1 created within 7d
    expect(m.orders_7d).toBe(1); // c1's 1d-ago stamp
    expect(m.orders_prev_7d).toBe(1); // c1's 10d-ago stamp
    expect(m.revenue_cents_30d).toBe(0);
    expect(m.revenue_cents_all).toBe(0);
    expect(m.gmv_cents_30d).toBe(0);
    expect(m.pro_vendors).toBe(0);
    expect(m.pending_upgrade_requests).toBe(0);
    expect(m.funnel).toEqual({
      signed_up: 2,
      with_booth: 2, // both programs have a card
      with_order: 2, // p1 has a stamp, p2 has a redeem (any stamp_events row)
      pro: 0,
    });
  });

  it("counts a program with no cards as signed up but not with_booth", () => {
    const m = computeLoopkitMetrics({
      nowMs: now,
      programs: [{ id: "p1", active: true, created_at: iso(1) }],
      cards: [],
      stampEvents: [],
    });

    expect(m.total_vendors).toBe(1);
    expect(m.active_vendors).toBe(1);
    expect(m.funnel).toEqual({
      signed_up: 1,
      with_booth: 0,
      with_order: 0,
      pro: 0,
    });
    expect(m.orders_7d).toBe(0);
    expect(m.orders_prev_7d).toBe(0);
  });

  it("counts visits as activity and won visits + redeems as rewards", () => {
    const m = computeLoopkitMetrics({
      nowMs: now,
      programs: [{ id: "p1", active: true, created_at: iso(1) }],
      cards: [{ id: "c1", program_id: "p1" }],
      stampEvents: [
        {
          card_id: "c1",
          kind: "visit",
          created_at: iso(1),
          payload: { won: true },
        },
        {
          card_id: "c1",
          kind: "visit",
          created_at: iso(2),
          payload: { won: false },
        },
        { card_id: "c1", kind: "visit", created_at: iso(10) },
        { card_id: "c1", kind: "redeem", created_at: iso(1) },
      ],
    });

    expect(m.orders_7d).toBe(2); // two visits within 7d
    expect(m.orders_prev_7d).toBe(1); // one visit in the prev-7d window
    expect(m.rewards_redeemed).toBe(2); // one won visit + one redeem
    expect(m.funnel.with_order).toBe(1); // p1 has activity
  });

  it("treats a stamp event exactly 7 days ago as inside the 7d window (inclusive cutoff)", () => {
    const m = computeLoopkitMetrics({
      nowMs: now,
      programs: [{ id: "p1", active: true, created_at: iso(1) }],
      cards: [{ id: "c1", program_id: "p1" }],
      stampEvents: [{ card_id: "c1", kind: "stamp", created_at: iso(7) }],
    });

    expect(m.orders_7d).toBe(1);
    expect(m.orders_prev_7d).toBe(0);
  });
});
