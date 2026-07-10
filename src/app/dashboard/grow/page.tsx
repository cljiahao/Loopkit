import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireVendor } from "@/lib/auth";
import { listPrograms } from "@/lib/program";
import { qrSvg } from "@/lib/qr";
import { CardLinkActions } from "@/app/dashboard/card-link";

export default async function GrowPage() {
  const { user } = await requireVendor();

  const programs = await listPrograms();
  if (programs.length === 0) redirect("/setup");
  const active = programs.filter((p) => p.active);

  // The QR must encode an absolute URL — a host-less path is unscannable. Fall
  // back to the request host when NEXT_PUBLIC_BASE_URL is unset.
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cardLink = `${origin}/c?v=${user.id}`;
  const cardQr = await qrSvg(cardLink);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Get customers to join
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One QR for your whole shop — print this at your counter or till. New
          customers scan it once and join{" "}
          {active.length > 0
            ? active.map((p) => p.name).join(", ")
            : "your programs"}{" "}
          automatically, no typing needed from you. Returning customers use the
          same link to check their cards.
        </p>
      </div>

      {active.length === 0 && (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          None of your programs are active right now — new scans won&apos;t join
          anything until you activate one.
        </p>
      )}

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div
            className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-32"
            dangerouslySetInnerHTML={{ __html: cardQr }}
          />
          <div className="min-w-0 space-y-3">
            <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {cardLink}
            </code>
            <CardLinkActions link={cardLink} />
          </div>
        </div>
      </div>
    </main>
  );
}
