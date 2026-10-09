"use client";

import { useActionState, useState, useTransition } from "react";
import { checkStatusAction } from "../api/actions";
import { forgetCustomerProof } from "@/lib/customer-proof-actions";
import { STATUS_IDLE } from "../types";
import { ProgramCardStatus } from "./program-card-status";
import { BirthdayField } from "./birthday-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CheckForm({
  vendorId,
  referralCode,
}: {
  vendorId: string;
  referralCode?: string;
}) {
  const [state, formAction, pending] = useActionState(
    checkStatusAction,
    STATUS_IDLE,
  );
  const [proofForgotten, setProofForgotten] = useState(false);
  const [switchMessage, setSwitchMessage] = useState<string | null>(null);
  const [switching, startSwitch] = useTransition();
  const found = state.status === "found" && !!state.cards && !proofForgotten;
  // Collapses the form once a card is found, so it doesn't push the reward
  // status/QR below the fold. "Not you?" reopens it; resolving a new
  // `state` re-collapses it (compared during render, not an effect, per
  // React's guidance for resetting state on a change).
  const [editingRequested, setEditingRequested] = useState(false);
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    setEditingRequested(false);
    setProofForgotten(false);
    setSwitchMessage(null);
  }
  const showForm = !found || editingRequested;

  function switchCustomer() {
    startSwitch(async () => {
      setSwitchMessage(null);
      const result = await forgetCustomerProof(vendorId).catch(() => ({
        success: false as const,
        error: "Could not forget this saved card. Try again.",
      }));
      if (!result.success) {
        setSwitchMessage(result.error);
        return;
      }
      setProofForgotten(true);
      setEditingRequested(true);
      setSwitchMessage(
        "Saved card forgotten on this browser. Enter another number to join, or paste a saved card code.",
      );
    });
  }

  return (
    <div className="space-y-6">
      {showForm ? (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="vendor" value={vendorId} />
          {referralCode && (
            <input type="hidden" name="ref" value={referralCode} />
          )}
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
          <div className="space-y-2">
            <Label htmlFor="card-code">
              Saved card code (optional on this device)
            </Label>
            <Input
              id="card-code"
              name="card_code"
              autoComplete="off"
              placeholder="Paste the code from your saved card"
            />
            <p className="text-xs text-muted-foreground">
              Keep a copy of your card code. If you lose it, ask the shop to
              recover your card.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={pending || switching}
            onClick={switchCustomer}
          >
            {switching
              ? "Forgetting saved card…"
              : "Forget saved card on this browser"}
          </Button>
          {switchMessage && (
            <p role="status" className="text-sm text-muted-foreground">
              {switchMessage}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending || switching}
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
              vendorId={vendorId}
              card={card}
              phone={state.phone!}
              vendorAvatarUrl={state.vendorAvatarUrl ?? null}
            />
          ))}
          <BirthdayField vendorId={vendorId} phone={state.phone!} />
        </div>
      )}
    </div>
  );
}
