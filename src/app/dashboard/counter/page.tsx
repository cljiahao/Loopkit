import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireVendor } from "@/features/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getVendorProfile } from "@/lib/vendor";
import { qrSvg } from "@/lib/qr";
import {
  PROGRAM_TYPE_BADGE,
  describeProgram,
} from "@/app/dashboard/program-display";
import { ServeCustomer } from "@/app/dashboard/serve-customer";
import { BackButton } from "@/components/back-button";
import { Badge } from "@/components/ui/badge";

type CounterPageProps = {
  searchParams: Promise<{ p?: string; phone?: string }>;
};

export default async function CounterPage({ searchParams }: CounterPageProps) {
  const { user } = await requireVendor();

  const { p, phone } = await searchParams;
  if (!p) redirect("/dashboard");

  const programs = await listPrograms();
  const program = currentProgram(programs, p);
  if (!program) redirect("/dashboard");

  const badge = PROGRAM_TYPE_BADGE[program.type] ?? PROGRAM_TYPE_BADGE.stamp;
  const config = (program.config ?? {}) as {
    redemption_mode?: "catalog" | "offset";
  };

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const shopJoinLink = `${origin}/c?v=${user.id}`;
  const shopJoinQrSvg = await qrSvg(shopJoinLink);
  const shopName = (await getVendorProfile()).name ?? "Your stall";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackButton href="/dashboard" label="Back to dashboard" />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold tracking-tight">{program.name}</h1>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {describeProgram(program)}
        </p>
      </div>

      <ServeCustomer
        key={program.id}
        programId={program.id}
        type={program.type}
        stampsRequired={program.stamps_required}
        rewardText={program.reward_text}
        initialPhone={phone}
        pointsRedemptionMode={config.redemption_mode}
        shopName={shopName}
        shopJoinQrSvg={shopJoinQrSvg}
        shopJoinLink={shopJoinLink}
      />
    </div>
  );
}
