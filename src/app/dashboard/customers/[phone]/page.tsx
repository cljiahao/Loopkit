import { notFound } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { listPrograms } from "@/lib/program";
import { getCustomerDetail } from "@/lib/customers";
import { listActivity } from "@/lib/activity";
import { normalizePhone } from "@/lib/phone";
import { formatSgtDate } from "@/lib/format";
import { ElevatedCard } from "@/components/elevated-card";
import { Badge } from "@/components/ui/badge";
import { ActivityTable } from "@/app/dashboard/activity/activity-table";
import { AdjustStampForm } from "./adjust-stamp-form";

const HISTORY_LIMIT = 50;

type CustomerDetailPageProps = {
  params: Promise<{ phone: string }>;
};

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  await requireVendor();

  const { phone: rawPhone } = await params;
  const normalized = normalizePhone(decodeURIComponent(rawPhone));
  if (!normalized.ok) notFound();
  const phone = normalized.phone;

  const [programs, detail] = await Promise.all([
    listPrograms(),
    getCustomerDetail(phone),
  ]);

  if (detail.cards.length === 0 && !detail.name) notFound();

  const programIds = programs.map((p) => p.id);
  const { rows: activity } = await listActivity({
    programIds,
    phone,
    limit: HISTORY_LIMIT,
    offset: 0,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {detail.name ?? phone}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {detail.name && `${phone} · `}
          {detail.lastSeenAt
            ? `Last seen ${formatSgtDate(detail.lastSeenAt)}`
            : "No visits recorded yet"}
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Cards
        </h2>
        {detail.cards.length === 0 ? (
          <ElevatedCard className="p-6">
            <p className="text-sm text-muted-foreground">
              No cards on any program yet.
            </p>
          </ElevatedCard>
        ) : (
          <ul className="space-y-3">
            {detail.cards.map((card) => (
              <ElevatedCard
                as="li"
                key={card.programId}
                className="space-y-3 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{card.programName}</span>
                    <Badge variant="secondary">{card.programType}</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {card.stampCount} stamps · {card.rewardCount} reward
                    {card.rewardCount === 1 ? "" : "s"}
                  </span>
                </div>
                {card.programType === "stamp" && (
                  <AdjustStampForm programId={card.programId} phone={phone} />
                )}
              </ElevatedCard>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Activity
        </h2>
        <ActivityTable activity={activity} showProgram />
      </div>
    </div>
  );
}
