const NOTIFY_TIMEOUT_MS = 3000;

/**
 * Fire-and-forget: notifies a customer who already has a standing Telegram
 * connection with merqo (from having connected via qkit with a matching
 * phone number), keyed by phone — loopkit's redemption event has no prior
 * connect-token round, so this always calls merqo's `notify-customer` in
 * its `phone` lookup mode, never `notify_ref`. Never throws: a missing
 * `MERQO_BASE_URL`/`MERQO_CUSTOMER_SECRET` no-ops, and a non-2xx response,
 * a timeout, or a network error is caught and logged — callers
 * (`redeemAction`) never let this affect their own result, same rule as
 * `sendTelegramMessage`.
 */
export async function notifyCustomerByPhone(
  vendorId: string,
  phone: string,
  message: string,
): Promise<void> {
  const baseUrl = process.env.MERQO_BASE_URL;
  const secret = process.env.MERQO_CUSTOMER_SECRET;
  if (!baseUrl || !secret) return;

  try {
    const res = await fetch(`${baseUrl}/api/merqo/notify-customer`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ vendor_id: vendorId, phone, message }),
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("notifyCustomerByPhone failed", res.status);
    }
  } catch (err) {
    console.error("notifyCustomerByPhone failed", err);
  }
}
