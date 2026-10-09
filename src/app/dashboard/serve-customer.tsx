"use client";
import type { ServeCustomerProps } from "./counter/use-serve-customer";
import { useServeCustomer } from "./counter/use-serve-customer";

import { ScanHero } from "@/app/dashboard/counter/scan-hero";
import { CounterActions } from "@/app/dashboard/counter/counter-actions";
import { ActiveCard } from "@/app/dashboard/counter/active-card";

import { ServedStrip } from "@/app/dashboard/counter/served-strip";

import { RewardCelebration } from "@/components/reward-celebration";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  showBranding = true,
}: ServeCustomerProps) {
  const {
    pending,
    phoneRef,
    formRef,
    detailsRef,
    served,
    result,
    redeemOpen,
    setRedeemOpen,
    regenOpen,
    setRegenOpen,
    recoveredCard,
    setRecoveredCard,
    lookingUp,
    celebration,
    setCelebration,
    copy,
    onPrimary,
    onLookup,
    handleScanResolved,
    handleUndo,
    handleCreated,
    confirmRedeemPlant,
    handleOffsetApplied,
    handleStampRedeemed,
    confirmRegenerate,
  } = useServeCustomer({
    programId,
    type,
    stampsRequired,
    rewardText,
    initialPhone,
    pointsRedemptionMode,
    shopName,
    shopJoinQrSvg,
    shopJoinLink,
    showBranding,
  });
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
            showBranding={showBranding}
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
          {recoveredCard && (
            <section
              aria-label="Recovered card"
              className="mb-4 space-y-3 rounded-xl border bg-card p-4"
            >
              <h2 className="font-semibold">Card access recovered</h2>
              <p className="text-sm">
                Give this code only to the customer you verified for{" "}
                {recoveredCard.phone}. Their progress is preserved. The previous
                card code no longer works.
              </p>
              <div
                role="img"
                aria-label="Recovered card QR code"
                dangerouslySetInnerHTML={{ __html: recoveredCard.qr }}
              />
              <Label htmlFor="recovered-card-code">Saved card code</Label>
              <Input
                id="recovered-card-code"
                readOnly
                value={recoveredCard.cardToken}
                onFocus={(event) => event.currentTarget.select()}
              />
              <p className="text-xs text-muted-foreground">
                Ask the customer to save this code privately for future
                recovery.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRecoveredCard(null)}
              >
                Done
              </Button>
            </section>
          )}
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
