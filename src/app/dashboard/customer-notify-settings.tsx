"use client";

import { useTransition } from "react";
import { saveCustomerNotifySettingsAction } from "./actions";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// current is null when the vendor has no vendor_notify_settings row yet
// (never visited this page) — that must still default checked, same
// backward-compat rule redeemAction's own gate applies server-side.
export function CustomerNotifySettings({
  current,
}: {
  current: { enabled: boolean } | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    // Matches ElevatedCard's classes directly — a <form> needs the action
    // prop, which ElevatedCard's as="div"|"section"|"li" prop type doesn't
    // support (same rationale as qkit-earn-settings.tsx).
    <form
      className="space-y-3 rounded-[20px] border bg-card p-4 shadow-[0_1px_0_0_var(--color-border),0_12px_28px_-20px_rgba(0,0,0,0.35)]"
      action={(fd) => {
        startTransition(() => {
          void saveCustomerNotifySettingsAction(fd);
        });
      }}
    >
      <div className="flex items-center gap-2">
        <Switch
          id="customer-notify-enabled"
          name="enabled"
          defaultChecked={current?.enabled ?? true}
          aria-label="Confirm redemptions to the customer on Telegram"
        />
        <Label htmlFor="customer-notify-enabled" className="text-sm">
          Confirm redemptions to the customer on Telegram
        </Label>
      </div>
      <p className="text-sm text-muted-foreground">
        When on, a customer who&apos;s already connected Telegram gets a message
        confirming their reward redemption. Off by request only — this never
        changes whether the redemption itself succeeds.
      </p>
      <Button
        type="submit"
        disabled={pending}
        className="h-10 w-full rounded-xl text-sm font-semibold"
      >
        Save
      </Button>
    </form>
  );
}
