import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { computeLoopkitMetrics } from "@/lib/metrics";

export const revalidate = 0;

// Ported verbatim from qkit's `bearerOk` — keep in lockstep with
// ../qkit/src/app/api/merqo/metrics/route.ts.
function bearerOk(request: Request): boolean {
  const secret = process.env.MERQO_METRICS_SECRET;
  // never allow an unset secret to authorize
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  // Constant-time compare so the endpoint doesn't leak the secret one byte at a
  // time via response timing. timingSafeEqual requires equal-length buffers, so
  // gate on length first (length is not itself sensitive here).
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();

  // Three independent reads — issue them concurrently so endpoint latency is
  // one round-trip, not the sum of three.
  const [programsRes, cardsRes, stampEventsRes] = await Promise.all([
    supabase.from("programs").select("id, active, created_at"),
    supabase.from("cards").select("id, program_id"),
    supabase.from("stamp_events").select("card_id, kind, created_at, payload"),
  ]);

  for (const r of [programsRes, cardsRes, stampEventsRes]) {
    if (r.error) {
      console.error("merqo metrics: read failed", r.error.message);
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 503 },
      );
    }
  }

  const metrics = computeLoopkitMetrics({
    nowMs: Date.now(),
    programs: programsRes.data ?? [],
    cards: cardsRes.data ?? [],
    stampEvents: stampEventsRes.data ?? [],
  });

  return NextResponse.json({
    product: "loopkit",
    generated_at: new Date().toISOString(),
    ...metrics,
  });
}
