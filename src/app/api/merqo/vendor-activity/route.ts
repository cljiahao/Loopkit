import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { listAllUsers } from "@/lib/list-all-users";
import { bearerOk } from "@/lib/merqo-auth";
import { computeVendorActivity } from "@/lib/merqo-vendor-activity";

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
  if (usersRes.error) {
    console.error("merqo vendor-activity: read failed", usersRes.error.message);
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const key = parsed.data.email.toLowerCase();
  const user = (usersRes.data?.users ?? []).find(
    (u) => u.email?.toLowerCase() === key,
  );
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [programsRes, proRes] = await Promise.all([
    supabase.from("programs").select("id").eq("vendor_id", user.id),
    supabase.from("vendor_pro").select("vendor_id").eq("vendor_id", user.id),
  ]);
  if (programsRes.error || proRes.error) {
    console.error(
      "merqo vendor-activity: read failed",
      programsRes.error?.message ?? proRes.error?.message,
    );
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 503 },
    );
  }

  const programs = (programsRes.data ?? []).map((p) => ({
    id: p.id as string,
  }));
  const isPro = (proRes.data ?? []).length > 0;
  const programIds = programs.map((p) => p.id);

  let cards: { id: string }[] = [];
  let events: {
    card_id: string;
    kind: string;
    created_at: string;
    payload?: unknown;
  }[] = [];

  if (programIds.length > 0) {
    const cardsRes = await supabase
      .from("cards")
      .select("id")
      .in("program_id", programIds);
    if (cardsRes.error) {
      console.error(
        "merqo vendor-activity: read failed",
        cardsRes.error.message,
      );
      return NextResponse.json(
        { error: "Upstream unavailable" },
        { status: 503 },
      );
    }
    cards = (cardsRes.data ?? []).map((c) => ({ id: c.id as string }));
    const cardIds = cards.map((c) => c.id);

    if (cardIds.length > 0) {
      const eventsRes = await supabase
        .from("stamp_events")
        .select("card_id, kind, created_at, payload")
        .in("card_id", cardIds);
      if (eventsRes.error) {
        console.error(
          "merqo vendor-activity: read failed",
          eventsRes.error.message,
        );
        return NextResponse.json(
          { error: "Upstream unavailable" },
          { status: 503 },
        );
      }
      events = eventsRes.data ?? [];
    }
  }

  const payload = computeVendorActivity(
    isPro,
    programs,
    cards,
    events,
    Date.now(),
  );
  return NextResponse.json(payload);
}
