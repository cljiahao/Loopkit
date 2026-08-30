"use client";

import { AuditLogTable, type AuditLogEntry } from "@merqo/ui";
import { formatSgtDateTime } from "@/lib/format";

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

// `AuditLogTable` is a `@merqo/ui` Client Component, so its `formatAction` /
// `dateFormatter` function props can't be handed to it from the Server
// Component page. This client boundary owns them; the page passes only the
// serializable `entries` array.
export function AdminActivityLog({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <AuditLogTable
      entries={entries}
      formatAction={formatAction}
      dateFormatter={(date) => formatSgtDateTime(date.toISOString())}
    />
  );
}
