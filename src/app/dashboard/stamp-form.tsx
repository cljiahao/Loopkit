"use client";

import { useActionState } from "react";
import { stampAction, redeemAction } from "@/app/dashboard/actions";
import { STAMP_IDLE } from "@/app/dashboard/stamp-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StampForm({ stampsRequired }: { stampsRequired: number }) {
  const [state, formAction, pending] = useActionState(stampAction, STAMP_IDLE);

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex items-end gap-3">
        <div className="flex-1 space-y-2">
          <Label
            htmlFor="phone"
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Customer phone
          </Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="9123 4567"
            className="h-11 rounded-xl"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          className="h-11 rounded-xl px-6 font-semibold"
        >
          Add stamp
        </Button>
      </form>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state.status === "ok" && state.card && (
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-sm font-medium">{state.card.phone}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.card.stamp_count} / {stampsRequired} stamps
          </p>
          {state.rewardReady && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-primary">
                Reward ready!
              </p>
              <form action={redeemAction}>
                <input type="hidden" name="card_id" value={state.card.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                >
                  Redeem
                </Button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
