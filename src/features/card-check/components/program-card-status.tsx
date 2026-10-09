"use client";
import { ProgressVisual } from "@/components/progress-visual";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateCardAction } from "../api/actions";
import type { CardStatus } from "../types";

import { PointsCatalogPicker } from "./points-catalog-picker";

import { CardShell } from "@/components/card-shell";
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

// One customer's progress card for a single program, at the vendor-level
// /c page. Each instance owns its own regenerate-dialog state — necessary
// now that a customer can have several of these on one page at once.
export function ProgramCardStatus({
  card,
  phone,
  vendorId = "",
  vendorAvatarUrl = null,
}: {
  card: CardStatus;
  phone: string;
  vendorId?: string;
  vendorAvatarUrl?: string | null;
}) {
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenerating, startRegenerate] = useTransition();
  const view = card.view;

  // Retired-card notices are dismissible on this device.
  const [noticeOpen, setNoticeOpen] = useState(false);

  const [freshVouchers, setFreshVouchers] = useState<
    { id: string; rewardText: string; qr: string }[]
  >([]);

  useEffect(() => {
    if (card.active || !card.replacedByName) return;
    const key = `loopkit:seen-replaced:${card.programId}`;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(key) !== null;
    } catch {
      // Storage is optional for the notice.
    }
    if (!dismissed) {
      // Reading localStorage (an external, non-reactive source) on mount to
      // seed one-time dialog state — not derivable from props/state, so
      // this isn't the render-time-derivation case the rule guards against.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNoticeOpen(true);
    }
    // Only re-check when the identity of the retired card changes — not on
    // every render, and not keyed on active/replacedByName individually
    // since those don't change without programId also changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.programId]);

  function dismissNotice() {
    try {
      localStorage.setItem(`loopkit:seen-replaced:${card.programId}`, "1");
    } catch {
      // Dismissing the notice also works when storage is unavailable.
    }
    setNoticeOpen(false);
  }

  function renderView() {
    if (!view) return null;
    const visual = (
      <ProgressVisual
        view={view}
        vendorAvatarUrl={vendorAvatarUrl}
        plantSeed={`${phone}:${card.programId}`}
      />
    );
    if (view?.kind === "dots") {
      if (view.variant === "points" && view.redemptionMode === "catalog")
        return (
          <div className="flex w-full flex-col items-center gap-3">
            {visual}
            <PointsCatalogPicker
              vendorId={vendorId}
              programId={card.programId}
              phone={phone}
              items={(view.catalog ?? []).filter((item) => item.affordable)}
              onSelected={(voucher) =>
                setFreshVouchers((prev) => [...prev, voucher])
              }
            />
          </div>
        );
      return visual;
    }
    return <div className="flex flex-col items-center gap-2">{visual}</div>;
  }

  function confirmRegenerate() {
    startRegenerate(async () => {
      const fd = new FormData();
      fd.set("program", card.programId);
      fd.set("phone", phone);
      fd.set("vendor", vendorId);
      const res = await regenerateCardAction(fd).catch(() => ({
        success: false as const,
        error: "Could not start a new card. Try again.",
      }));
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success("New card issued — check your card again to see it.");
      setRegenOpen(false);
    });
  }

  return (
    <CardShell>
      <p className="text-sm font-semibold">{card.name}</p>
      {renderView()}
      <p className="font-mono text-sm font-medium">{card.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {card.reward_text}
      </p>
      {card.rewardReady && (
        <p className="text-sm font-semibold text-gold-accent">
          🎉 Reward ready!
        </p>
      )}
      {card.expired && (
        <p className="text-sm font-semibold text-destructive">
          This card has expired.
        </p>
      )}
      {!card.active && (
        <p className="text-xs text-muted-foreground">
          {card.replacedByName
            ? `This card is retired — check your rewards again to see your new ${card.replacedByName} card.`
            : "This program is no longer joinable, but you can still redeem what you've earned."}
        </p>
      )}
      {card.qr && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <div
            className="w-full max-w-[180px] rounded-xl border bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: card.qr }}
          />
          <p className="text-xs text-muted-foreground">Show this to the shop</p>
        </div>
      )}
      {card.cardCode && (
        <p className="break-all text-xs text-muted-foreground">
          Save your card code: <code>{card.cardCode}</code>
        </p>
      )}
      {(card.activeVouchers.length > 0 || freshVouchers.length > 0) && (
        <div className="w-full space-y-2 border-t pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your rewards
          </p>
          {[...card.activeVouchers, ...freshVouchers].map((v) => (
            <div
              key={v.id}
              className="flex flex-col items-center gap-1.5 rounded-xl border p-2"
            >
              <p className="text-xs font-medium">{v.rewardText}</p>
              <div
                className="w-full max-w-[120px] rounded-lg border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: v.qr }}
              />
            </div>
          ))}
        </div>
      )}
      {card.expired && (
        <AlertDialog open={regenOpen} onOpenChange={setRegenOpen}>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl text-xs text-muted-foreground"
            >
              {card.expired ? "Get a new card" : "Start a new cycle"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Get a new card?</AlertDialogTitle>
              <AlertDialogDescription>
                This starts a fresh expired cycle and resets its progress to
                zero. Any reward you&apos;ve already earned should be redeemed
                at the shop first.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={regenerating}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={regenerating}
                onClick={(e) => {
                  e.preventDefault();
                  confirmRegenerate();
                }}
              >
                {regenerating ? "Issuing…" : "Get a new card"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {card.replacedByName && (
        <AlertDialog
          open={noticeOpen}
          onOpenChange={(open) => {
            if (!open) dismissNotice();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {card.name} has a new card: {card.replacedByName}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your old rewards are still yours to redeem — show the shop this
                card. Next time you check in, you&apos;ll get the new card
                automatically.
                {card.carriedOverCount
                  ? ` Your ${card.carriedOverCount} stamps carried over.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={dismissNotice}>
                Got it
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </CardShell>
  );
}
