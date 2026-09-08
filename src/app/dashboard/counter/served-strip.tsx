import { Button } from "@/components/ui/button";

export type ServedEntry = {
  id: string;
  phone: string;
  note: string;
  undoable: boolean;
};

// Last few customers served on this visit to the Counter. Only the most
// recent stamp carries an Undo (single-level, see the plan); redemptions and
// non-stamp plays show without one.
export function ServedStrip({
  entries,
  onUndo,
}: {
  entries: ServedEntry[];
  onUndo: (entry: ServedEntry) => void;
}) {
  if (entries.length === 0) return null;

  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Served just now
      </p>
      <ul className="space-y-1.5">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="min-w-0 truncate">
              <span className="font-mono">{maskPhone(entry.phone)}</span>
              <span className="text-muted-foreground"> {entry.note}</span>
            </span>
            {entry.undoable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onUndo(entry)}
                className="h-7 shrink-0 rounded-lg px-2 text-xs"
              >
                Undo
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `••••${digits.slice(-4)}`;
}
