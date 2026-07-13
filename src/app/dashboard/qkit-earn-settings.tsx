"use client";

import { useTransition } from "react";
import { saveQkitEarnConfigAction } from "./actions";

type Program = { id: string; name: string };

export function QkitEarnSettings({
  programs,
  current,
  isPro,
}: {
  programs: Program[];
  current: { programId: string; enabled: boolean } | null;
  isPro: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (!isPro) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Upgrade to Pro to award a stamp automatically when a customer completes
        a qkit order.
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      action={(fd) => {
        startTransition(() => {
          void saveQkitEarnConfigAction(fd);
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={current?.enabled ?? false}
          aria-label="Earn from qkit orders"
        />
        Earn from qkit orders
      </label>
      <select
        name="program_id"
        defaultValue={current?.programId ?? ""}
        className="w-full rounded border p-2 text-sm"
      >
        <option value="" disabled>
          Choose a program
        </option>
        {programs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="text-sm font-medium">
        Save
      </button>
    </form>
  );
}
