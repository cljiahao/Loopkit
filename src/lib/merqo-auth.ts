import { timingSafeEqual } from "node:crypto";

/** Constant-time bearer check against MERQO_PROVISION_SECRET — a DIFFERENT
 *  env var from vendor-status/metrics's MERQO_METRICS_SECRET, since this
 *  guards a write endpoint. Mirrors qkit's provisionBearerOk verbatim. */
export function provisionBearerOk(request: Request): boolean {
  const secret = process.env.MERQO_PROVISION_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
