import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveVendorStatus } from "@/lib/merqo-vendor-status";

export const revalidate = 0;

// Ported verbatim from qkit's `bearerOk` — keep in lockstep with
// ../qkit/src/app/api/merqo/vendor-status/route.ts.
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

const querySchema = z.object({ email: z.string().email() });

export async function GET(request: Request) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    email: searchParams.get("email") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supabase = await createServiceClient();

  const [usersRes, programsRes, proRes] = await Promise.all([
    // Known limitation: listUsers paginates but we only fetch page 1 (1000 users max).
    // Once loopkit has >1000 auth users, vendors past the first page silently resolve as
    // inactive. TODO: implement pagination to fetch all pages.
    supabase.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("programs").select("vendor_id"),
    supabase.from("vendor_pro").select("vendor_id"),
  ]);

  if (usersRes.error || programsRes.error || proRes.error) {
    console.error(
      "merqo vendor-status: read failed",
      usersRes.error?.message ??
        programsRes.error?.message ??
        proRes.error?.message,
    );
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  if (usersRes.data?.users.length === 1000) {
    console.error(
      "merqo vendor-status: listUsers returned a full page (1000) — pagination not implemented, some vendors past this page may resolve as inactive",
    );
  }

  const status = resolveVendorStatus(
    parsed.data.email,
    (usersRes.data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
    })),
    (programsRes.data ?? []).map((p) => p.vendor_id as string),
    (proRes.data ?? []).map((p) => p.vendor_id as string),
  );

  return NextResponse.json(status);
}
