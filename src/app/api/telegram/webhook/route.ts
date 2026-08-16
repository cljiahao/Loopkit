import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendTelegramMessage } from "@/lib/telegram";

export const revalidate = 0;

const START_PREFIX = "/start ";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number };
  };
};

// Constant-time compare against TELEGRAM_WEBHOOK_SECRET, same rationale as
// merqo-auth.ts's bearerOk — this endpoint has no session cookie, so the
// header value IS the entire authentication for the route.
function secretOk(request: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const provided = Buffer.from(header);
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

// Not excluded via src/proxy.ts's matcher config — it doesn't need to be.
// updateSession's isProtectedPath only gates /dashboard and /setup, so this
// route is already reachable with no session cookie, matching Telegram's
// own request shape.
export async function POST(request: Request) {
  if (!secretOk(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const text = update.message?.text;
  const chatId = update.message?.chat?.id;
  if (!text || !text.startsWith(START_PREFIX) || chatId === undefined) {
    return NextResponse.json({ ok: true });
  }

  const token = text.slice(START_PREFIX.length).trim();
  if (!token) return NextResponse.json({ ok: true });

  const supabase = await createServiceClient();
  const { data: linkToken, error: lookupError } = await supabase
    .from("telegram_link_tokens")
    .select("vendor_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (lookupError) {
    console.error("telegram webhook: token lookup failed", lookupError.message);
    return NextResponse.json({ ok: true });
  }

  if (!linkToken || new Date(linkToken.expires_at) <= new Date()) {
    return NextResponse.json({ ok: true });
  }

  const { error: upsertError } = await supabase
    .from("vendor_telegram")
    .upsert(
      { vendor_id: linkToken.vendor_id, chat_id: chatId },
      { onConflict: "vendor_id" },
    );
  if (upsertError) {
    console.error(
      "telegram webhook: vendor_telegram upsert failed",
      upsertError.message,
    );
    return NextResponse.json({ ok: true });
  }

  const { error: deleteError } = await supabase
    .from("telegram_link_tokens")
    .delete()
    .eq("token", token);
  if (deleteError) {
    console.error("telegram webhook: token delete failed", deleteError.message);
  }

  await sendTelegramMessage(
    chatId,
    "Telegram connected. You'll get a message here on every reward redemption.",
  );

  return NextResponse.json({ ok: true });
}
