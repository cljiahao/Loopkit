"use client";

import { RedeemButton } from "@/app/dashboard/redeem-button";
import { PointsOffsetForm } from "@/app/dashboard/points-offset-form";
import type { StampCard } from "@/app/dashboard/card";
import type { ServeResult } from "@/app/dashboard/counter/serve-result";
import { Plant } from "@/components/plant";
import { Cup } from "@/components/cup";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { Button } from "@/components/ui/button";
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

const READY_CARD = "rounded-xl border border-gold bg-gold/10 p-4";
const PLAIN_CARD = "rounded-xl border bg-muted/40 p-4";

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

// Reward-ready redemption control for a stamp-mode result. Three mutually
// exclusive shapes (offset apply form, catalog no-op note, or the classic
// RedeemButton) kept in one place so the caller's JSX has no nested ternary.
function RedemptionControl({
  mode,
  card,
  stampsRequired,
  onOffsetApplied,
  onRedeemed,
}: {
  mode?: "catalog" | "offset";
  card: StampCard;
  stampsRequired: number;
  onOffsetApplied: (card: StampCard, dollars: number) => void;
  onRedeemed: (card: StampCard) => void;
}) {
  if (mode === "offset") {
    return <PointsOffsetForm card={card} onApplied={onOffsetApplied} />;
  }
  if (mode === "catalog") {
    return (
      <p className="text-sm text-muted-foreground">
        Customer redeems their picked reward from their own card.
      </p>
    );
  }
  return (
    <RedeemButton
      card={card}
      stampsRequired={stampsRequired}
      onRedeemed={onRedeemed}
    />
  );
}

function EmptyState() {
  return (
    <div
      data-state="empty"
      className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center"
    >
      <div aria-hidden className="mb-3 flex gap-1.5 opacity-30">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="size-2.5 rounded-full bg-muted-foreground" />
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        No customer yet. Scan a card, add a new customer, or enter a number to
        begin.
      </p>
    </div>
  );
}

type ActiveCardProps = {
  result: ServeResult | null;
  stampsRequired: number;
  rewardText: string;
  pointsRedemptionMode?: "catalog" | "offset";
  pending: boolean;
  redeemOpen: boolean;
  onRedeemOpenChange: (open: boolean) => void;
  regenOpen: boolean;
  onRegenOpenChange: (open: boolean) => void;
  onConfirmRedeemPlant: () => void;
  onConfirmRegenerate: () => void;
  onOffsetApplied: (card: StampCard, dollars: number) => void;
  onRedeemed: (card: StampCard) => void;
};

// The Counter's right column: an explicit empty state until a customer loads,
// then the per-mechanic result block plus the regenerate-card dialog. Every
// block is the original serve-customer.tsx markup, moved not rewritten.
export function ActiveCard(props: ActiveCardProps) {
  const { result } = props;
  if (result === null) return <EmptyState />;

  return (
    <div className="space-y-4">
      {result.mode === "stamp" && <StampBlock {...props} result={result} />}
      {result.mode === "lucky" && (
        <div className={result.won ? READY_CARD : PLAIN_CARD}>
          <p className="text-sm font-medium">{result.phone}</p>
          {luckyResultMessage(result, props.rewardText)}
        </div>
      )}
      {result.mode === "plant" && <PlantBlock {...props} result={result} />}
      {result.mode === "chance" && <ChanceBlock result={result} />}

      <AlertDialog
        open={props.regenOpen}
        onOpenChange={props.onRegenOpenChange}
      >
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
              Issues {result.phone} a fresh QR code and resets their progress to
              zero, for a lost code or an expired card. Their lifetime reward
              count is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={props.pending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={props.pending}
              onClick={(e) => {
                e.preventDefault();
                props.onConfirmRegenerate();
              }}
            >
              {props.pending ? "Regenerating…" : "Regenerate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StampBlock({
  result,
  stampsRequired,
  pointsRedemptionMode,
  onOffsetApplied,
  onRedeemed,
}: ActiveCardProps & { result: Extract<ServeResult, { mode: "stamp" }> }) {
  return (
    <div className={result.rewardReady ? READY_CARD : PLAIN_CARD}>
      <p className="text-sm font-medium">{result.phone}</p>
      <p className="mt-1 font-mono text-sm text-muted-foreground">
        {result.card.stamp_count} / {stampsRequired} stamps
      </p>
      {result.rewardReady && (
        <div className="mt-3 space-y-2">
          <p className="text-sm font-semibold text-gold-accent">
            Reward ready!
          </p>
          <RedemptionControl
            mode={pointsRedemptionMode}
            card={result.card}
            stampsRequired={stampsRequired}
            onOffsetApplied={onOffsetApplied}
            onRedeemed={onRedeemed}
          />
        </div>
      )}
    </div>
  );
}

function PlantBlock({
  result,
  rewardText,
  pending,
  redeemOpen,
  onRedeemOpenChange,
  onConfirmRedeemPlant,
}: ActiveCardProps & { result: Extract<ServeResult, { mode: "plant" }> }) {
  return (
    <div className={result.rewardReady ? READY_CARD : PLAIN_CARD}>
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
            seed={result.phone}
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
          <AlertDialog open={redeemOpen} onOpenChange={onRedeemOpenChange}>
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
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={pending}
                  onClick={(e) => {
                    e.preventDefault();
                    onConfirmRedeemPlant();
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
  );
}

function ChanceBlock({
  result,
}: {
  result: Extract<ServeResult, { mode: "chance" }>;
}) {
  const landed = result.view.segments.find(
    (s) => s.id === result.view.landedId,
  );
  return (
    <div className={result.wonThisTime ? READY_CARD : PLAIN_CARD}>
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
            label={landed?.label ?? ""}
            reward={landed?.reward ?? false}
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
  );
}
