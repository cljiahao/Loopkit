import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time Bearer-token check against the named environment variable.
 * Shared by every /api/merqo/* route handler — each guards a different
 * secret (`MERQO_METRICS_SECRET` for the read/reporting routes,
 * `MERQO_PROVISION_SECRET` for the write route), passed in by name so the
 * two secrets are never interchangeable.
 */
export function bearerOk(request: Request, envVarName: string): boolean {
  const secret = process.env[envVarName];
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

/** Constant-time bearer check against MERQO_PROVISION_SECRET — a DIFFERENT
 *  env var from vendor-status/metrics's MERQO_METRICS_SECRET, since this
 *  guards a write endpoint. */
export function provisionBearerOk(request: Request): boolean {
  return bearerOk(request, "MERQO_PROVISION_SECRET");
}
