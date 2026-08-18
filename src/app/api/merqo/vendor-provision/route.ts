import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { provisionBearerOk } from "@/lib/merqo-auth";
import { recordAudit } from "@/lib/admin-audit";

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

  // Called unconditionally (not gated on alreadyExisted): a vendors-row
  // conflict doesn't correlate with whether a program already exists (e.g.
  // an email/password vendor with no prior vendors row, or one with a real
  // program from /setup's create_program path). provision_default_program
  // is idempotent on loopkit.programs itself (migration 0032) — a null
  // returned id means the vendor already had a program, not an error.
  const { error: rpcError } = await supabase.rpc("provision_default_program", {
    p_vendor_id: user_id,
  });
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

  const plan = proRow ? "pro" : "free";

  // merqo push-provisions this vendor over a bearer secret, not a signed-in
  // admin — there's no real admin (or merqo-team user) id to attribute this
  // to. Sentinel convention (see recordAudit's docstring, @/lib/admin-audit):
  // admin_id is the vendor's own auth.users id (the only id guaranteed to
  // satisfy admin_id's FK here — it's the row that was just provisioned),
  // and detail.actor = "merqo_system" documents that this action was taken
  // BY merqo ON this vendor, not something the vendor did to themselves.
  // Best-effort — never fails the response the caller is waiting on.
  await recordAudit(user_id, "merqo_vendor_provision", user_id, {
    actor: "merqo_system",
    already_existed: alreadyExisted,
    plan,
  });

  return NextResponse.json({
    ok: true,
    already_existed: alreadyExisted,
    plan,
  });
}
