import { requireVendor } from "@/features/auth";
import { listPrograms, isPro } from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import { getOrCreateTelegramLinkToken } from "@/lib/telegram-link";
import { qrSvg } from "@/lib/qr";
import { QkitEarnSettings } from "@/app/dashboard/qkit-earn-settings";
import { ConnectTelegramSection } from "@/app/dashboard/settings/connect-telegram-section";
import { BackButton } from "@/components/back-button";

// Only called once vendor_telegram has no row for this vendor. Reads
// TELEGRAM_BOT_USERNAME directly (rather than threading it through props)
// since building the deep link is entirely a server-side concern — nothing
// here is client-rendered.
async function buildDisconnectedTelegramSection(vendorId: string) {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return { connected: false as const, configured: false as const };
  }

  const token = await getOrCreateTelegramLinkToken(vendorId);
  const deepLink = `https://t.me/${botUsername}?start=${token}`;
  const qrSvgMarkup = await qrSvg(deepLink);
  return {
    connected: false as const,
    configured: true as const,
    qrSvgMarkup,
    deepLink,
  };
}

export default async function SettingsPage() {
  const { user } = await requireVendor();
  const supabase = await createServerClient();

  const [programs, pro, qkitEarnConfigResult, telegramLinkResult] =
    await Promise.all([
      listPrograms(),
      isPro(),
      supabase
        .from("qkit_earn_config")
        .select("program_id, enabled")
        .eq("vendor_id", user.id)
        .maybeSingle(),
      supabase
        .from("vendor_telegram")
        .select("chat_id")
        .eq("vendor_id", user.id)
        .maybeSingle(),
    ]);
  const qkitEarnConfig = qkitEarnConfigResult.data;

  const telegramSection = telegramLinkResult.data
    ? { connected: true as const }
    : await buildDisconnectedTelegramSection(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <BackButton href="/dashboard" label="Back to dashboard" />
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect loopkit with the other tools you use.
        </p>
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          qkit integration
        </h2>
        <QkitEarnSettings
          programs={programs
            .filter((prog) => prog.type === "stamp")
            .map((prog) => ({
              id: prog.id,
              name: prog.name,
            }))}
          current={
            qkitEarnConfig
              ? {
                  programId: qkitEarnConfig.program_id,
                  enabled: qkitEarnConfig.enabled,
                }
              : null
          }
          isPro={pro}
        />
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Telegram alerts
        </h2>
        <ConnectTelegramSection {...telegramSection} />
      </div>
    </div>
  );
}
