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
} from "@/app/dashboard/actions";
import { RedeemButton } from "@/app/dashboard/redeem-button";
import { ScanButton } from "@/app/dashboard/scan-button";
import { Plant } from "@/components/plant";
import { Cup } from "@/components/cup";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { RewardCelebration } from "@/components/reward-celebration";
import type { StampCard } from "@/app/dashboard/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type PlantView = {
  kind: "plant";
  stage: number;
  stageName: string;
  totalStages: number;
  wilting: boolean;
  variant: "plant" | "cup";
};

type ChanceView = {
  kind: "chance";
  variant: "wheel" | "scratch";
  segments: { id: string; label: string; reward: boolean }[];
  landedId: string | null;
};

type ServeResult =
  | { mode: "stamp"; phone: string; card: StampCard; rewardReady: boolean }
  | {
      mode: "lucky";
      phone: string;
      played: boolean;
      won: boolean;
      label: string;
    }
  | {
      mode: "plant";
      phone: string;
      view: PlantView;
      label: string;
      rewardReady: boolean;
      rewardUnlocked: boolean;
    }
  | {
      mode: "chance";
      phone: string;
      view: ChanceView;
      label: string;
      wonThisTime: boolean;
      rewardText: string;
    };

function luckyResultMessage(
  result: Extract<ServeResult, { mode: "lucky" }>,
  rewardText: string,
) {
  if (result.won) {
    return (
      <p className="mt-1 text-sm font-semibold text-gold-accent">
        🎉 Won {rewardText}!
      </p>
    );
  }
  if (result.played) {
    return (
      <p className="mt-1 text-sm text-muted-foreground">No win this time.</p>
    );
  }
  return <p className="mt-1 text-sm text-muted-foreground">{result.label}</p>;
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
}: {
  programId: string;
  type: string;
  stampsRequired: number;
  rewardText: string;
  initialPhone?: string;
}) {
  const router = useRouter();
  const { pending, run } = useAsyncAction();
  const phoneRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
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
  // whether to reset the form (a failed/no-op attempt should leave the
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
      toast.success(`🌻 ${res.phone} bloomed — ${res.reward_text} unlocked!`);
      setCelebration({ phone: res.phone, rewardText: res.reward_text });
    } else {
      toast(`Watered ${res.phone} — now ${res.progress.view.stageName}.`);
    }
    setResult({
      mode: "plant",
      phone: res.phone,
      view: res.progress.view,
      label: res.progress.label,
      rewardReady: res.progress.rewardReady,
      rewardUnlocked: res.rewardUnlocked,
    });
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
      `Stamped ${res.card.phone} — ${res.card.stamp_count}/${stampsRequired}`,
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
        if (type === "plant") {
          if (res.progress.view.kind !== "plant") return;
          setResult({
            mode: "plant",
            phone: res.card.phone,
            view: res.progress.view,
            label: res.progress.label,
            rewardReady: res.progress.rewardReady,
            rewardUnlocked: false,
          });
        } else if (type === "lucky") {
          setResult({
            mode: "lucky",
            phone: res.card.phone,
            played: false,
            won: false,
            label: res.progress.label,
          });
        } else if (type === "wheel" || type === "scratch") {
          if (res.progress.view.kind !== "chance") return;
          setResult({
            mode: "chance",
            phone: res.card.phone,
            view: res.progress.view,
            label: res.progress.label,
            wonThisTime: false,
            rewardText,
          });
        } else {
          setResult({
            mode: "stamp",
            phone: res.card.phone,
            card: res.card,
            rewardReady: res.progress.rewardReady,
          });
        }
      } finally {
        setLookingUp(false);
      }
    });
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
      setRedeemOpen(false);
      router.refresh();
    });
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
    <div className="space-y-4">
      <div className="flex justify-end">
        <ScanButton
          label="Scan a QR instead"
          variant="link"
          onResolved={({ phone, programId: scannedProgramId }) => {
            if (scannedProgramId !== programId) {
              router.push(
                `/dashboard/counter?p=${scannedProgramId}&phone=${encodeURIComponent(phone)}`,
              );
              return;
            }
            if (phoneRef.current) {
              phoneRef.current.value = phone;
              formRef.current?.requestSubmit();
            }
          }}
        />
      </div>

      <form
        ref={formRef}
        onSubmit={onPrimary}
        className="flex flex-wrap items-end gap-3"
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

      {result?.mode === "stamp" && (
        <div
          className={
            result.rewardReady
              ? "rounded-xl border border-gold bg-gold/10 p-4"
              : "rounded-xl border bg-muted/40 p-4"
          }
        >
          <p className="text-sm font-medium">{result.phone}</p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {result.card.stamp_count} / {stampsRequired} stamps
          </p>
          {result.rewardReady && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-semibold text-gold-accent">
                Reward ready!
              </p>
              <RedeemButton
                card={result.card}
                stampsRequired={stampsRequired}
                onRedeemed={(next) =>
                  setResult({
                    mode: "stamp",
                    phone: next.phone,
                    card: next,
                    rewardReady: false,
                  })
                }
              />
            </div>
          )}
        </div>
      )}

      {result?.mode === "lucky" && (
        <div
          className={
            result.won
              ? "rounded-xl border border-gold bg-gold/10 p-4"
              : "rounded-xl border bg-muted/40 p-4"
          }
        >
          <p className="text-sm font-medium">{result.phone}</p>
          {luckyResultMessage(result, rewardText)}
        </div>
      )}

      {result?.mode === "plant" && (
        <div
          className={
            result.rewardReady
              ? "rounded-xl border border-gold bg-gold/10 p-4"
              : "rounded-xl border bg-muted/40 p-4"
          }
        >
          <div className="flex items-center gap-4">
            {result.view.variant === "cup" ? (
              <Cup
                stage={result.view.stage}
                totalStages={result.view.totalStages}
                wilting={result.view.wilting}
                className="size-24 shrink-0"
              />
            ) : (
              <Plant
                stage={result.view.stage}
                totalStages={result.view.totalStages}
                wilting={result.view.wilting}
                className="size-24 shrink-0"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">{result.phone}</p>
              <p className="text-sm text-muted-foreground">{result.label}</p>
              {result.rewardUnlocked && (
                <p className="text-sm font-semibold text-gold-accent">
                  🌻 Bloomed! {rewardText} unlocked.
                </p>
              )}
            </div>
          </div>
          {result.rewardReady && (
            <div className="mt-4">
              <AlertDialog open={redeemOpen} onOpenChange={setRedeemOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-xl">
                    Redeem
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Redeem reward?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Redeem {rewardText} for {result.phone}? Any extra growth
                      carries over to their next plant.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={pending}
                      onClick={(e) => {
                        e.preventDefault();
                        confirmRedeemPlant();
                      }}
                    >
                      {pending ? "Redeeming…" : "Redeem"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}

      {result?.mode === "chance" && (
        <div
          className={
            result.wonThisTime
              ? "rounded-xl border border-gold bg-gold/10 p-4"
              : "rounded-xl border bg-muted/40 p-4"
          }
        >
          <div className="flex items-center gap-4">
            {result.view.variant === "wheel" ? (
              <Wheel
                segments={result.view.segments}
                landedId={result.view.landedId}
                className="shrink-0"
              />
            ) : (
              <ScratchCard
                revealed={result.view.landedId !== null}
                label={
                  result.view.segments.find(
                    (s) => s.id === result.view.landedId,
                  )?.label ?? ""
                }
                reward={
                  result.view.segments.find(
                    (s) => s.id === result.view.landedId,
                  )?.reward ?? false
                }
                className="shrink-0"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">{result.phone}</p>
              <p className="text-sm text-muted-foreground">{result.label}</p>
              {result.wonThisTime && (
                <p className="text-sm font-semibold text-gold-accent">
                  🎉 Won {result.rewardText}!
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {result && (
        <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl text-muted-foreground"
            >
              Regenerate card
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate this card?</AlertDialogTitle>
              <AlertDialogDescription>
                Issues {result.phone} a fresh QR code and resets their progress
                to zero — for a lost code or an expired card. Their lifetime
                reward count is kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  confirmRegenerate();
                }}
              >
                {pending ? "Regenerating…" : "Regenerate"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <RewardCelebration
        open={celebration !== null}
        phone={celebration?.phone ?? ""}
        rewardText={celebration?.rewardText ?? ""}
        onOpenChange={(open) => {
          if (!open) setCelebration(null);
        }}
      />
    </div>
  );
}
