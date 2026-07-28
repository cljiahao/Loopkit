import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { provisionBearerOk } from "@/lib/merqo-auth";

export const revalidate = 0;

const bodySchema = z.object({ user_id: z.string().uuid() });

export async function POST(request: Request) {
  if (!provisionBearerOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  const { user_id } = parsed.data;

  const supabase = await createServiceClient();

  const { error: insertError } = await supabase
    .from("vendors")
    .insert({ vendor_id: user_id });
  const alreadyExisted = insertError?.code === "23505";
  if (insertError && !alreadyExisted) {
    if (insertError.code === "23503") {
      return NextResponse.json({ error: "Unknown user_id" }, { status: 400 });
    }
    console.error("vendor-provision: insert failed", insertError.message);
    return NextResponse.json(
      { error: "Could not provision vendor" },
      { status: 500 },
    );
  }

  if (!alreadyExisted) {
    const { error: rpcError } = await supabase.rpc(
      "provision_default_program",
      { p_vendor_id: user_id },
    );
    if (rpcError) {
      console.error(
        "vendor-provision: default program creation failed",
        rpcError.message,
      );
      return NextResponse.json(
        { error: "Could not provision vendor" },
        { status: 500 },
      );
    }
  }

  // loopkit has no vendors.plan column — plan is derived from vendor_pro row
  // existence, exactly like src/lib/merqo-vendor-status.ts's
  // resolveVendorStatus already does for the vendor-status route. Mirror
  // that derivation here rather than reading a plan column that doesn't
  // exist.
  const { data: proRow, error: proReadError } = await supabase
    .from("vendor_pro")
    .select("vendor_id")
    .eq("vendor_id", user_id)
    .maybeSingle();
  if (proReadError) {
    console.error(
      "vendor-provision: vendor_pro read-back failed",
      proReadError.message,
    );
    return NextResponse.json(
      { error: "Could not read vendor plan" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    already_existed: alreadyExisted,
    plan: proRow ? "pro" : "free",
  });
}
