const TELEGRAM_API = "https://api.telegram.org";

// Fire-and-forget alert helper. Telegram alerts are optional infra, never a
// hard dependency: a missing bot token no-ops, and a fetch rejection is
// caught and logged rather than propagated — callers (redeemAction) never
// let a Telegram failure affect their own result.
export async function sendTelegramMessage(
  chatId: number,
  text: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("sendTelegramMessage failed", err);
  }
}

// A-Z a-z 0-9 _ - only, <=64 chars — Telegram's own deep-link payload
// constraint (the /start <payload> the bot receives), not a design choice.
export function generateLinkToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}
