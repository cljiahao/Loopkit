import { requireVendor } from "@/features/auth";
import { listPrograms, isPro } from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import { QkitEarnSettings } from "@/app/dashboard/qkit-earn-settings";
import { BackButton } from "@/components/back-button";

export default async function SettingsPage() {
  const { user } = await requireVendor();
  const supabase = await createServerClient();

  const [programs, pro, qkitEarnConfigResult] = await Promise.all([
    listPrograms(),
    isPro(),
    supabase
      .from("qkit_earn_config")
      .select("program_id, enabled")
      .eq("vendor_id", user.id)
      .maybeSingle(),
  ]);
  const qkitEarnConfig = qkitEarnConfigResult.data;

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
    </div>
  );
}
