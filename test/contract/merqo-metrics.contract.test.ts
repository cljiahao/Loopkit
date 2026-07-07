import { describe, it, expect } from "vitest";
import { z } from "zod";
import { computeLoopkitMetrics } from "@/lib/metrics";

// Copied verbatim from ../merqo/src/lib/metrics-schema.ts. Do NOT import
// across repos at runtime — keep this file's schema hand-synced with merqo's
// so a drift between the two shows up here as a failing test, not a broken
// /team page in production.
const metricsPayloadSchema = z.object({
  product: z.string(),
  generated_at: z.string(),
  revenue_cents_30d: z.number(),
  revenue_cents_all: z.number(),
  gmv_cents_30d: z.number(),
  active_vendors: z.number(),
  orders_7d: z.number(),
  orders_prev_7d: z.number(),
  signups_7d: z.number(),
  pro_vendors: z.number(),
  total_vendors: z.number(),
  pending_upgrade_requests: z.number(),
  funnel: z.object({
    signed_up: z.number(),
    with_booth: z.number(),
    with_order: z.number(),
    pro: z.number(),
  }),
});

describe("loopkit metrics payload satisfies merqo's contract", () => {
  it("passes metricsPayloadSchema.safeParse", () => {
    const now = Date.UTC(2026, 6, 7);
    const iso = (daysAgo: number) =>
      new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    const sample = computeLoopkitMetrics({
      nowMs: now,
      programs: [
        { id: "p1", active: true, created_at: iso(1) },
        { id: "p2", active: false, created_at: iso(40) },
      ],
      cards: [
        { id: "c1", program_id: "p1" },
        { id: "c2", program_id: "p2" },
      ],
      stampEvents: [
        { card_id: "c1", kind: "stamp", created_at: iso(1) },
        { card_id: "c1", kind: "stamp", created_at: iso(10) },
        { card_id: "c2", kind: "redeem", created_at: iso(3) },
      ],
    });

    const payload = {
      product: "loopkit",
      generated_at: new Date().toISOString(),
      ...sample,
    };

    const result = metricsPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});
