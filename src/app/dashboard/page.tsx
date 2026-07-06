import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { getProgram } from "@/lib/program";
import { createServerClient } from "@/lib/supabase/server";
import { StampForm } from "@/app/dashboard/stamp-form";

export default async function DashboardPage() {
  await requireVendor();

  const program = await getProgram();
  if (!program) redirect("/setup");

  const supabase = await createServerClient();
  // RLS (events_own) already scopes this to the signed-in vendor's cards.
  const { data: events } = await supabase
    .from("stamp_events")
    .select("kind,created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{program.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Buy {program.stamps_required}, get 1 {program.reward_text}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Stamp a customer
        </h2>
        <div className="mt-4">
          <StampForm stampsRequired={program.stamps_required} />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity
        </h2>
        <ul className="mt-4 space-y-2">
          {events && events.length > 0 ? (
            events.map((event, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="capitalize">{event.kind}</span>
                <span className="text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-muted-foreground">No stamps yet.</li>
          )}
        </ul>
      </div>
    </main>
  );
}
