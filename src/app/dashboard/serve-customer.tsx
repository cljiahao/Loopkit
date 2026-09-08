"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import {
  stampAction,
  recordVisitAction,
  lookupAction,
  redeemPlantAction,
  regenerateCardAction,
  adjustStampAction,
} from "@/app/dashboard/actions";
import type { ScanResolved } from "@/app/dashboard/scan-button";
import { ScanHero } from "@/app/dashboard/counter/scan-hero";
import { CounterActions } from "@/app/dashboard/counter/counter-actions";
import { ActiveCard } from "@/app/dashboard/counter/active-card";
import type { ServeResult } from "@/app/dashboard/counter/serve-result";
import {
  ServedStrip,
  type ServedEntry,
} from "@/app/dashboard/counter/served-strip";
import { useServedStrip } from "@/app/dashboard/counter/use-served-strip";
import { RewardCelebration } from "@/components/reward-celebration";
import type { StampCard } from "@/app/dashboard/card";
import type { Progress } from "@/lib/engine/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Where a resolved scan should go: redeem a voucher, hop to another
// program's counter, or drop the phone into the manual form and submit.
function planScan(
  scan: ScanResolved,
  programId: string,
):
  | { action: "voucher"; token: string }
  | { action: "route"; programId: string; phone: string }
  | { action: "fill"; phone: string } {
  if (scan.kind === "voucher") {
    return { action: "voucher", token: scan.voucherToken };
  }
  if (scan.programId !== programId) {
    return { action: "route", programId: scan.programId, phone: scan.phone };
  }
  return { action: "fill", phone: scan.phone };
}

// Map a non-mutating lookup into the matching result panel. null when the
// engine view does not fit the program type (nothing to show).
function lookupToResult(
  type: string,
  card: StampCard,
  progress: Progress,
  rewardText: string,
): ServeResult | null {
  const { view, label, rewardReady } = progress;
  if (type === "plant") {
    if (view.kind !== "plant") return null;
    return {
      mode: "plant",
      phone: card.phone,
      view,
      label,
      rewardReady,
      rewardUnlocked: false,
    };
  }
  if (type === "lucky") {
    return {
      mode: "lucky",
      phone: card.phone,
      played: false,
      won: false,
      label,
    };
  }
  if (type === "wheel" || type === "scratch") {
    if (view.kind !== "chance") return null;
    return {
      mode: "chance",
      phone: card.phone,
      view,
      label,
      wonThisTime: false,
      rewardText,
    };
  }
  return { mode: "stamp", phone: card.phone, card, rewardReady };
}

const ACTION_COPY: Record<string, { idle: string; pending: string }> = {
  lucky: { idle: "Play", pending: "Playing…" },
  plant: { idle: "Water", pending: "Watering…" },
  stamp: { idle: "Add stamp", pending: "Stamping…" },
  wheel: { idle: "Spin", pending: "Spinning…" },
  scratch: { idle: "Scratch", pending: "Scratching…" },
};

export function ServeCustomer({
  programId,
  type,
  stampsRequired,
  rewardText,
  initialPhone,
  pointsRedemptionMode,
  shopName,
  shopJoinQrSvg,
  shopJoinLink,
}: {
  programId: string;
  type: string;
  stampsRequired: number;
  rewardText: string;
  initialPhone?: string;
  pointsRedemptionMode?: "catalog" | "offset";
  shopName: string;
  shopJoinQrSvg: string;
  shopJoinLink: string;
}) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const phoneRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const { served, push: pushServed, markDone } = useServedStrip();
  const [result, setResult] = useState<ServeResult | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [celebration, setCelebration] = useState<{
    phone: string;
    rewardText: string;
  } | null>(null);

  const copy = ACTION_COPY[type] ?? ACTION_COPY.stamp;

  // Each visit-recording flow is its own async step: call the server action,
  // toast + celebrate on the outcome, and store the new card state. Returns
  // whether the visit was actually recorded, so onPrimary below knows
  // whether to reset the form (a failed or no-op attempt should leave the
  // scanned phone number in place for retry).
  async function handleLuckyVisit(formData: FormData): Promise<boolean> {
    const res = await recordVisitAction(formData);
    if (!res.success) {
      toast.error(res.error);
      return false;
    }
    if (res.rewardUnlocked) {
      toast.success(`🎉 ${res.phone} won ${res.reward_text}!`);
      setCelebration({ phone: res.phone, rewardText: res.reward_text });
    } else {
      toast(`No win this time for ${res.phone}.`);
    }
    setResult({
      mode: "lucky",
      phone: res.phone,
      played: true,
      won: res.rewardUnlocked,
      label: res.progress.label,
    });
    pushServed(res.phone, res.progress.label, false);
    return true;
  }

  async function handlePlantVisit(formData: FormData): Promise<boolean> {
    const res = await recordVisitAction(formData);
    if (!res.success) {
      toast.error(res.error);
      return false;
    }
    if (res.progress.view.kind !== "plant") return false;
    if (res.rewardUnlocked) {
      toast.success(`🌻 ${res.phone} bloomed, ${res.reward_text} unlocked!`);
      setCelebration({ phone: res.phone, rewardText: res.reward_text });
    } else {
      toast(`Watered ${res.phone}, now ${res.progress.view.stageName}.`);
    }
    setResult({
      mode: "plant",
      phone: res.phone,
      view: res.progress.view,
      label: res.progress.label,
      rewardReady: res.progress.rewardReady,
      rewardUnlocked: res.rewardUnlocked,
    });
    pushServed(res.phone, res.progress.label, false);
    return true;
  }

  async function handleChanceVisit(formData: FormData): Promise<boolean> {
    const res = await recordVisitAction(formData);
    if (!res.success) {
      toast.error(res.error);
      return false;
    }
    if (res.progress.view.kind !== "chance") return false;
    if (res.rewardUnlocked) {
      toast.success(`🎉 ${res.phone} won ${res.reward_text}!`);
      setCelebration({ phone: res.phone, rewardText: res.reward_text });
    } else {
      toast(`No win this time for ${res.phone}.`);
    }
    setResult({
      mode: "chance",
      phone: res.phone,
      view: res.progress.view,
      label: res.progress.label,
      wonThisTime: res.rewardUnlocked,
      rewardText: res.reward_text,
    });
    pushServed(res.phone, res.progress.label, false);
    return true;
  }

  async function handleStampVisit(formData: FormData): Promise<boolean> {
    const prevResult = result;
    const res = await stampAction(formData);
    if (!res.success) {
      toast.error(res.error);
      return false;
    }
    toast.success(
      `Stamped ${res.card.phone}, ${res.card.stamp_count}/${stampsRequired}`,
    );
    const wasReady =
      prevResult?.mode === "stamp" && prevResult.phone === res.card.phone
        ? prevResult.rewardReady
        : false;
    if (res.rewardReady && !wasReady) {
      setCelebration({ phone: res.card.phone, rewardText });
    }
    setResult({
      mode: "stamp",
      phone: res.card.phone,
      card: res.card,
      rewardReady: res.rewardReady,
    });
    const prevCount =
      prevResult?.mode === "stamp" && prevResult.phone === res.card.phone
        ? prevResult.card.stamp_count
        : res.card.stamp_count - 1;
    pushServed(
      res.card.phone,
      `${prevCount} to ${res.card.stamp_count} of ${stampsRequired}`,
      true,
    );
    return true;
  }

  function onPrimary(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    run(async () => {
      let recorded: boolean;
      if (type === "lucky") {
        recorded = await handleLuckyVisit(formData);
      } else if (type === "plant") {
        recorded = await handlePlantVisit(formData);
      } else if (type === "wheel" || type === "scratch") {
        recorded = await handleChanceVisit(formData);
      } else {
        recorded = await handleStampVisit(formData);
      }
      if (!recorded) return;
      router.refresh();
      formEl.reset();
      phoneRef.current?.focus();
    });
  }

  function onLookup() {
    const formEl = formRef.current;
    if (!formEl) return;
    const formData = new FormData(formEl);
    run(async () => {
      setLookingUp(true);
      try {
        const res = await lookupAction(formData);
        if (!res.success) {
          toast.error(res.error);
          return;
        }
        const next = lookupToResult(type, res.card, res.progress, rewardText);
        if (next) setResult(next);
      } finally {
        setLookingUp(false);
      }
    });
  }

  function handleScanResolved(scan: ScanResolved) {
    const plan = planScan(scan, programId);
    if (plan.action === "voucher") {
      router.push(
        `/dashboard/redeem-voucher?token=${encodeURIComponent(plan.token)}`,
      );
    } else if (plan.action === "route") {
      router.push(
        `/dashboard/counter?p=${plan.programId}&phone=${encodeURIComponent(plan.phone)}`,
      );
    } else if (phoneRef.current) {
      detailsRef.current?.setAttribute("open", "");
      phoneRef.current.value = plan.phone;
      formRef.current?.requestSubmit();
    }
  }

  function handleUndo(entry: ServedEntry) {
    run(async () => {
      const fd = new FormData();
      fd.set("program_id", programId);
      fd.set("phone", entry.phone);
      fd.set("delta", "-1");
      fd.set("reason", "undo");
      const res = await adjustStampAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Undid the last stamp for ${res.card.phone}.`);
      markDone(entry.id);
      setResult((cur) =>
        cur && cur.mode === "stamp" && cur.phone === res.card.phone
          ? {
              mode: "stamp",
              phone: res.card.phone,
              card: res.card,
              rewardReady: res.rewardReady,
            }
          : cur,
      );
      router.refresh();
    });
  }

  function handleCreated(phone: string, card: StampCard) {
    setResult({
      mode: "stamp",
      phone,
      card,
      rewardReady: card.stamp_count >= stampsRequired,
    });
    pushServed(phone, `1 of ${stampsRequired}, new card`, true);
    router.refresh();
  }

  function confirmRedeemPlant() {
    if (!result || result.mode !== "plant") return;
    const phone = result.phone;
    run(async () => {
      const fd = new FormData();
      fd.set("phone", phone);
      fd.set("program_id", programId);
      const res = await redeemPlantAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Reward redeemed for ${res.phone}.`);
      if (res.progress.view.kind === "plant") {
        setResult({
          mode: "plant",
          phone: res.phone,
          view: res.progress.view,
          label: res.progress.label,
          rewardReady: res.progress.rewardReady,
          rewardUnlocked: false,
        });
      } else {
        setResult(null);
      }
      pushServed(res.phone, `reward redeemed, ${rewardText}`, false);
      setRedeemOpen(false);
      router.refresh();
    });
  }

  function handleOffsetApplied(next: StampCard, dollars: number) {
    setResult({
      mode: "stamp",
      phone: next.phone,
      card: next,
      rewardReady: next.stamp_count > 0,
    });
    pushServed(next.phone, `reward applied, $${dollars} off`, false);
  }

  function handleStampRedeemed(next: StampCard) {
    setResult({
      mode: "stamp",
      phone: next.phone,
      card: next,
      rewardReady: false,
    });
    pushServed(next.phone, `reward redeemed, ${rewardText}`, false);
  }

  function confirmRegenerate() {
    if (!result) return;
    const phone = result.phone;
    run(async () => {
      const fd = new FormData();
      fd.set("phone", phone);
      fd.set("program_id", programId);
      const res = await regenerateCardAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Issued a fresh card for ${res.phone}.`);
      setResult(null);
      setRegenOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-4">
          <ScanHero onResolved={handleScanResolved} />

          <CounterActions
            programId={programId}
            shopName={shopName}
            shopJoinQrSvg={shopJoinQrSvg}
            shopJoinLink={shopJoinLink}
            onCreated={handleCreated}
          />

          <details
            ref={detailsRef}
            className="rounded-xl border bg-card p-4 [&_summary]:cursor-pointer"
          >
            <summary className="text-sm font-medium">
              Existing customer who can&rsquo;t scan? Enter their number
            </summary>
            <form
              ref={formRef}
              onSubmit={onPrimary}
              className="mt-3 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="program_id" value={programId} />
              <div className="min-w-48 flex-1 space-y-2">
                <Label
                  htmlFor="phone"
                  className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Customer phone
                </Label>
                <Input
                  ref={phoneRef}
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  placeholder="9123 4567"
                  defaultValue={initialPhone}
                  className="h-11 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                disabled={pending}
                className="h-11 rounded-xl px-6 font-semibold"
              >
                {pending && !lookingUp ? copy.pending : copy.idle}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={onLookup}
                className="h-11 rounded-xl px-5 font-semibold"
              >
                {lookingUp ? "Looking up…" : "Look up"}
              </Button>
            </form>
          </details>

          <ServedStrip entries={served} onUndo={handleUndo} />
        </div>

        <div>
          <ActiveCard
            result={result}
            stampsRequired={stampsRequired}
            rewardText={rewardText}
            pointsRedemptionMode={pointsRedemptionMode}
            pending={pending}
            redeemOpen={redeemOpen}
            onRedeemOpenChange={setRedeemOpen}
            regenOpen={regenOpen}
            onRegenOpenChange={setRegenOpen}
            onConfirmRedeemPlant={confirmRedeemPlant}
            onConfirmRegenerate={confirmRegenerate}
            onOffsetApplied={handleOffsetApplied}
            onRedeemed={handleStampRedeemed}
          />
        </div>
      </div>

      <RewardCelebration
        open={celebration !== null}
        phone={celebration?.phone ?? ""}
        rewardText={celebration?.rewardText ?? ""}
        onOpenChange={(open) => {
          if (!open) setCelebration(null);
        }}
      />
    </>
  );
}
