import { AuditLogTable, type AuditLogEntry } from "@merqo/ui";
import { requireAdmin } from "@/lib/admin";
import { listAdminAudit, type AdminAuditRow } from "@/lib/admin-data";
import { formatSgtDateTime } from "@/lib/format";
import type { Json } from "@/lib/types";

export const revalidate = 0;

// Human labels for the real `action` strings written by recordAudit's call
// sites (src/app/admin/actions.ts, src/app/api/merqo/vendor-provision).
// Unrecognized actions fall back to the raw string, not a guessed label.
const ACTION_LABELS: Record<string, string> = {
  set_program_active: "Program activation changed",
  set_vendor_pro: "Vendor Pro status changed",
  remove_card: "Card removed",
  resolve_upgrade_request: "Upgrade request resolved",
  set_pricing: "Pricing updated",
  merqo_vendor_provision: "Vendor provisioned (merqo)",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function isRecord(value: Json | null): value is Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// `detail.actor === "merqo_system"` is the documented sentinel (recordAudit's
// docstring) marking merqo_vendor_provision as system-attributed rather than
// a real admin's action; surfaced as the actor label instead of a raw id.
function actorLabel(row: AdminAuditRow): string {
  if (row.actor_email) return row.actor_email;
  if (isRecord(row.detail) && row.detail.actor === "merqo_system") {
    return "Merqo (system)";
  }
  return row.admin_id;
}

// Readable rendering of the jsonb `detail` column, e.g. "active: true". The
// `actor` sentinel key is dropped here since it's already surfaced above.
function detailText(detail: Json | null): string | null {
  if (!isRecord(detail)) return detail == null ? null : String(detail);
  const entries = Object.entries(detail).filter(([key]) => key !== "actor");
  if (entries.length === 0) return null;
  return entries
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
}

function toEntry(row: AdminAuditRow): AuditLogEntry {
  return {
    id: row.id,
    actor: actorLabel(row),
    action: row.action,
    target: row.target_id,
    detail: detailText(row.detail),
    createdAt: row.created_at,
  };
}

export default async function AdminActivityPage() {
  await requireAdmin();
  const rows = await listAdminAudit(100);

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Internal
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
      </div>

      <AuditLogTable
        entries={rows.map(toEntry)}
        formatAction={formatAction}
        dateFormatter={(date) => formatSgtDateTime(date.toISOString())}
      />
    </main>
  );
}
