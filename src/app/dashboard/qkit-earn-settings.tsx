"use client";

import { useTransition } from "react";
import { saveQkitEarnConfigAction } from "./actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
      <div className="flex items-center gap-2">
        <Switch
          id="qkit-earn-enabled"
          name="enabled"
          defaultChecked={current?.enabled ?? false}
          aria-label="Earn from qkit orders"
        />
        <Label htmlFor="qkit-earn-enabled" className="text-sm">
          Earn from qkit orders
        </Label>
      </div>
      <Select name="program_id" defaultValue={current?.programId || undefined}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a program" />
        </SelectTrigger>
        <SelectContent>
          {programs.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button type="submit" disabled={pending} className="text-sm font-medium">
        Save
      </button>
    </form>
  );
}
