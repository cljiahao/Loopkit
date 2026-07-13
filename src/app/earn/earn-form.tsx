"use client";

import { useActionState } from "react";
import { claimEarnAction, type EarnState } from "./actions";

const initialState: EarnState = { status: "idle" };

export function EarnForm({
  orderId,
  vendorName,
}: {
  orderId: string;
  vendorName?: string;
}) {
  const [state, formAction, pending] = useActionState(
    claimEarnAction,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div className="rounded-lg border p-4 text-center">
        <p className="text-lg font-semibold">
          {state.stampCount}/{state.stampsRequired} stamps
        </p>
        {state.rewardText && (
          <p className="text-sm text-muted-foreground">{state.rewardText}</p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="order" value={orderId} />
      <p className="text-sm">Earn a stamp with {vendorName ?? "this shop"}?</p>
      <input
        name="phone"
        placeholder="9XXX XXXX"
        className="w-full rounded border p-2 text-sm"
        required
      />
      <input
        name="name"
        placeholder="Name (optional)"
        className="w-full rounded border p-2 text-sm"
      />
      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
      <button type="submit" disabled={pending} className="text-sm font-medium">
        {pending ? "Claiming…" : "Claim stamp"}
      </button>
    </form>
  );
}
