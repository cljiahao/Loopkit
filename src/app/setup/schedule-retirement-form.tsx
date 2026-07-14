"use client";

import { useActionState } from "react";
import { scheduleRetirementAction } from "@/app/setup/actions";
import type { Program } from "@/lib/program";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function ScheduleRetirementForm({
  program,
  successors,
}: {
  program: Pick<Program, "id" | "name">;
  successors: Pick<Program, "id" | "name">[];
}) {
  const [state, formAction, pending] = useActionState(
    scheduleRetirementAction,
    {},
  );

  return (
    <form action={formAction} className="mt-7 space-y-5">
      <input type="hidden" name="id" value={program.id} />
      <div className="space-y-2">
        <Label htmlFor="successor_id" className={labelClass}>
          Replacement card
        </Label>
        <select
          id="successor_id"
          name="successor_id"
          required
          className="h-11 w-full rounded-xl border bg-card px-3 text-sm"
        >
          {successors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="date" className={labelClass}>
          Retirement date
        </Label>
        <Input
          id="date"
          name="date"
          type="date"
          required
          className="h-11 rounded-xl"
        />
      </div>
      {state.error ? (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="h-12 w-full rounded-xl text-base font-semibold"
      >
        Schedule retirement
      </Button>
    </form>
  );
}
