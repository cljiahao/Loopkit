"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { redeemVoucherAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";

export function RedeemVoucherConfirm({
  token,
  phone,
  rewardText,
}: {
  token: string;
  phone: string;
  rewardText: string;
}) {
  const { pending, run } = useAsyncAction();
  const [redeemedText, setRedeemedText] = useState<string | null>(null);

  function confirm() {
    run(async () => {
      const fd = new FormData();
      fd.set("token", token);
      const res = await redeemVoucherAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Redeemed for ${phone}.`);
      setRedeemedText(res.rewardText);
    });
  }

  if (redeemedText) {
    return (
      <div className="space-y-3 rounded-xl border border-gold bg-gold/10 p-5 text-center">
        <p className="text-sm font-semibold text-gold-accent">Redeemed! 🎉</p>
        <p className="text-sm text-muted-foreground">{redeemedText}</p>
        <BackButton href="/dashboard" label="Back to dashboard" />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-muted/40 p-5 text-center">
      <p className="text-lg font-semibold">{rewardText}</p>
      <p className="text-sm text-muted-foreground">{phone}</p>
      <Button
        type="button"
        size="lg"
        disabled={pending}
        onClick={confirm}
        className="h-12 w-full rounded-xl font-semibold"
      >
        {pending ? "Redeeming…" : "Redeem"}
      </Button>
    </div>
  );
}
