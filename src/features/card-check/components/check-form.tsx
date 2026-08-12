"use client";

import { useActionState, useState } from "react";
import { checkStatusAction } from "../api/actions";
import { STATUS_IDLE } from "../types";
import { ProgramCardStatus } from "./program-card-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CheckForm({ vendorId }: { vendorId: string }) {
  const [state, formAction, pending] = useActionState(
    checkStatusAction,
    STATUS_IDLE,
  );
  const found = state.status === "found" && !!state.cards;
  // A successful check collapses the (now-stale) form so the card status —
  // and the QR the customer needs to show the shop — isn't pushed below a
  // form they've already filled in. Re-opened on demand via "Not you?", and
  // re-collapsed once a fresh result comes back (not immediately on submit,
  // so the form stays visible through the pending "Checking…" state). Reset
  // during render (not an effect) when `state` changes — the pattern React
  // recommends for adjusting state in response to a prop/state change.
  const [editingRequested, setEditingRequested] = useState(false);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    setEditingRequested(false);
  }
  const showForm = !found || editingRequested;

  return (
    <div className="space-y-6">
      {showForm ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="vendor" value={vendorId} />
          <div className="space-y-2">
            <Label
              htmlFor="phone"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Your phone number
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
            className="h-11 w-full rounded-xl text-base font-semibold"
          >
            {pending ? "Checking…" : "Check my card"}
          </Button>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">{state.phone}</span>
          </p>
          <button
            type="button"
            onClick={() => setEditingRequested(true)}
            className="shrink-0 text-xs font-semibold text-primary underline-offset-4 hover:underline"
          >
            Not you?
          </button>
        </div>
      )}

      {(state.status === "none" || state.status === "error") && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {found && (
        <div className="space-y-4">
          {state.cards!.map((card) => (
            <ProgramCardStatus
              key={card.programId}
              card={card}
              phone={state.phone!}
              vendorAvatarUrl={state.vendorAvatarUrl ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
