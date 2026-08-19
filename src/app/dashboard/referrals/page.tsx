import { headers } from "next/headers";
import { requireVendor } from "@/features/auth";
import { listPrograms } from "@/lib/program";
import { listReferralHosts, referralLink } from "@/lib/referrals";
import { qrSvg } from "@/lib/qr";
import { BackButton } from "@/components/back-button";
import { ElevatedCard } from "@/components/elevated-card";
import { ReferralsPanel } from "./referrals-panel";

export default async function ReferralsPage() {
  const { user } = await requireVendor();

  const [programs, referralHosts] = await Promise.all([
    listPrograms(),
    listReferralHosts(),
  ]);
  const activePrograms = programs.filter((p) => p.active);
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const hosts = await Promise.all(
    referralHosts.map(async (host) => {
      const link = referralLink(origin, user.id, host.referralCode);
      return {
        id: host.id,
        programId: host.programId,
        programName: programNameById[host.programId] ?? "Unknown program",
        hostPhone: host.hostPhone,
        label: host.label,
        referralCode: host.referralCode,
        guestCount: host.guestCount,
        link,
        qr: await qrSvg(link),
      };
    }),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <BackButton href="/dashboard" label="Back to dashboard" />
      <div>
        <h1 className="font-display text-2xl font-bold">Referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A wedding or event guest is a one-off visit, but the host who chose
          you — the bride, groom, or organizer — is a real repeat relationship.
          Give a host their own link on one of your programs: every guest who
          joins through it earns their own card as usual, and bumps the host one
          stamp/visit.
        </p>
      </div>

      {activePrograms.length === 0 ? (
        <ElevatedCard className="p-6">
          <p className="text-sm text-muted-foreground">
            Set up an active program first, then come back to create a referral
            link.
          </p>
        </ElevatedCard>
      ) : (
        <ReferralsPanel
          programs={activePrograms.map((p) => ({ id: p.id, name: p.name }))}
          initialHosts={hosts}
        />
      )}
    </div>
  );
}
