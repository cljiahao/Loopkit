import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { bearerOk } from "@/lib/merqo-auth";

export const revalidate = 0;

export async function GET(request: Request) {
  if (!bearerOk(request, "MERQO_METRICS_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const vendorId = searchParams.get("vendor_id");
  if (!vendorId) {
    return NextResponse.json({ error: "vendor_id required" }, { status: 400 });
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("qkit_earn_config")
    .select("enabled, programs(name)")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (error) {
    console.error("qkit-earn-config: read failed", error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  if (!data || !data.enabled) {
    return NextResponse.json({ enabled: false });
  }

  const programName = (data.programs as unknown as { name: string } | null)
    ?.name;
  return NextResponse.json({ enabled: true, program_name: programName });
}
