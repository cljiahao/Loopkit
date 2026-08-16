import { createServiceClient } from "@/lib/supabase/server";
import { generateLinkToken } from "@/lib/telegram";

const TOKEN_TTL_MS = 30 * 60 * 1000;

// Impure shell backing the dashboard settings "Connect Telegram" section.
// telegram_link_tokens has no client write grant at all (migration 0036) —
// every call here runs on the service-role client. Reuses an existing
// unexpired token instead of minting a new one on every settings-page
// render, so refreshing the page doesn't spam single-use rows.
export async function getOrCreateTelegramLinkToken(
  vendorId: string,
): Promise<string> {
  const supabase = await createServiceClient();

  const { data: existing } = await supabase
    .from("telegram_link_tokens")
    .select("token")
    .eq("vendor_id", vendorId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing.token;

  const token = generateLinkToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  const { error } = await supabase
    .from("telegram_link_tokens")
    .insert({ token, vendor_id: vendorId, expires_at: expiresAt });
  if (error) throw new Error(error.message);

  return token;
}

// Disconnect: deletes the vendor's own vendor_telegram row. Same
// service-role requirement as the token issuer above — no client write
// grant exists on vendor_telegram either.
export async function disconnectTelegram(vendorId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("vendor_telegram")
    .delete()
    .eq("vendor_id", vendorId);
  if (error) throw new Error(error.message);
}
