import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveVendorStatus } from "@/lib/merqo-vendor-status";
import { listAllUsers } from "@/lib/list-all-users";
import { bearerOk } from "@/lib/merqo-auth";

export const revalidate = 0;

const querySchema = z.object({ email: z.string().email() });

export async function GET(request: Request) {
  if (!bearerOk(request, "MERQO_METRICS_SECRET")) {
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

  const usersRes = await listAllUsers(supabase);
  if (usersRes.error)
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  const key = parsed.data.email.toLowerCase();
  const user = usersRes.data?.users.find((u) => u.email?.toLowerCase() === key);
  if (!user) return NextResponse.json({ active: false, plan: null });
  const [programsRes, proRes] = await Promise.all([
    supabase
      .from("programs")
      .select("vendor_id")
      .eq("vendor_id", user.id)
      .limit(1),
    supabase
      .from("vendor_pro")
      .select("vendor_id")
      .eq("vendor_id", user.id)
      .limit(1),
  ]);
  if (programsRes.error || proRes.error)
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );

  const status = resolveVendorStatus(
    parsed.data.email,
    usersRes.data?.users ?? [],
    (programsRes.data ?? []).map((p) => p.vendor_id as string),
    (proRes.data ?? []).map((p) => p.vendor_id as string),
  );

  return NextResponse.json(status);
}
