"use client";

import { centsToDollars } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { Section } from "@/components/section";
import { EditImpactDialog } from "@/app/setup/edit-impact-dialog";
import { InfoTooltip } from "@merqo/ui";

import { SlidersHorizontal } from "lucide-react";

import type { SetupFormState, SetupFormProps } from "./use-setup-form-state";
const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

export function SetupRulesFields({
  controller,
  program,
  isEdit,
  replacingId,
  prepping,
}: {
  controller: Pick<
    SetupFormState,
    | "state"
    | "pending"
    | "type"
    | "headStart"
    | "setHeadStart"
    | "headStartPercent"
    | "setHeadStartPercent"
    | "carryOverStamps"
    | "setCarryOverStamps"
    | "showCarryOverOption"
    | "birthdayBonusEnabled"
    | "setBirthdayBonusEnabled"
    | "isCreateFlow"
    | "setStep"
    | "editImpactLines"
  >;
} & Pick<SetupFormProps, "program" | "isEdit" | "replacingId" | "prepping">) {
  const {
    state,
    pending,
    type,
    carryOverStamps,
    setCarryOverStamps,
    showCarryOverOption,
    birthdayBonusEnabled,
    setBirthdayBonusEnabled,
    isCreateFlow,
    setStep,
    editImpactLines,
  } = controller;
  return (
    <Section
      icon={<SlidersHorizontal className="size-4" />}
      eyebrow="How it works"
      title="Rules"
      description="Head start, carry-over, and how long a card lasts."
    >
      {<HeadStartFields controller={controller} />}

      {isEdit && type === "stamp" && (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
          <Switch
            id="birthday_bonus_enabled_checkbox"
            checked={birthdayBonusEnabled}
            onCheckedChange={setBirthdayBonusEnabled}
            className="mt-0.5"
          />
          <label htmlFor="birthday_bonus_enabled_checkbox" className="text-sm">
            <span className="font-medium">
              Give a bonus stamp on a customer&apos;s birthday
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Customers can add their birthday on their card page. One extra
              stamp is granted the next time they visit on or after it, once per
              year.
            </span>
          </label>
          <input
            type="hidden"
            name="birthday_bonus_enabled"
            value={birthdayBonusEnabled ? "true" : "false"}
          />
        </div>
      )}

      {showCarryOverOption && (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
          <Switch
            id="carry_over_stamps_checkbox"
            checked={carryOverStamps}
            onCheckedChange={setCarryOverStamps}
            className="mt-0.5"
          />
          <label htmlFor="carry_over_stamps_checkbox" className="text-sm">
            <span className="font-medium">
              Carry over customers&apos; current stamp count onto the new card
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Left unchecked, everyone starts the new card from zero.
            </span>
          </label>
          <input
            type="hidden"
            name="carry_over_stamps"
            value={carryOverStamps ? "true" : "false"}
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="expiry_days" className={labelClass}>
            Card expires after (days, optional)
          </Label>
          <InfoTooltip
            ariaLabel="How card expiry is counted"
            trigger="tap"
            content={
              <>
                Counted from each customer&apos;s current cycle — resets
                whenever their card is regenerated.
              </>
            }
          />
        </div>
        <Input
          id="expiry_days"
          name="expiry_days"
          type="number"
          min={1}
          max={3650}
          placeholder="Never expires"
          defaultValue={program?.expiry_days ?? ""}
          className="h-11 rounded-xl"
        />
        <p className="text-xs text-muted-foreground">
          Leave blank for a card that never expires.
        </p>
      </div>

      {(type === "stamp" || type === "plant") && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="reward_expiry_days" className={labelClass}>
              Reward expires after (days, optional)
            </Label>
            <InfoTooltip
              ariaLabel="How reward expiry differs from card expiry"
              trigger="tap"
              content={
                <>
                  Counted from the moment a customer earns the reward — separate
                  from the card-expiry setting above, which resets a whole
                  card&apos;s progress after inactivity.
                </>
              }
            />
          </div>
          <Input
            id="reward_expiry_days"
            name="reward_expiry_days"
            type="number"
            min={1}
            max={3650}
            placeholder="Never expires"
            defaultValue={isEdit ? (program?.reward_expiry_days ?? "") : 90}
            className="h-11 rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            Pre-filled to 90 days. Clear the box if you want earned rewards to
            never expire.
          </p>
        </div>
      )}

      {type === "stamp" && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="reward_cost_dollars" className={labelClass}>
              Reward cost (SGD, optional)
            </Label>
            <InfoTooltip
              ariaLabel="What this figure is used for"
              trigger="tap"
              content={
                <>
                  Roughly what one reward costs you to give away. Powers the
                  cost view on your dashboard. Nothing is shown to customers.
                </>
              }
            />
          </div>
          <Input
            id="reward_cost_dollars"
            name="reward_cost_dollars"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            placeholder="1.20"
            defaultValue={
              program?.reward_cost_cents != null
                ? centsToDollars(program.reward_cost_cents).toString()
                : ""
            }
            className="h-11 rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank if you would rather not track it.
          </p>
        </div>
      )}

      {state.error ? (
        <p className="text-sm font-medium text-destructive">{state.error}</p>
      ) : null}

      {isEdit ? (
        <EditImpactDialog
          impactLines={editImpactLines}
          pending={pending}
          label="Save changes"
        />
      ) : (
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-12 w-full rounded-xl text-base font-semibold"
        >
          {creationLabel(replacingId, prepping)}
        </Button>
      )}
      {isCreateFlow && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => setStep(1)}
        >
          ← Back
        </Button>
      )}
    </Section>
  );
}

function HeadStartFields({
  controller,
}: {
  controller: Pick<
    SetupFormState,
    | "type"
    | "headStart"
    | "setHeadStart"
    | "headStartPercent"
    | "setHeadStartPercent"
  >;
}) {
  const {
    type,
    headStart,
    setHeadStart,
    headStartPercent,
    setHeadStartPercent,
  } = controller;
  return (
    <>
      {(type === "stamp" || type === "plant") && (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
          <Switch
            id="head_start_checkbox"
            checked={headStart}
            onCheckedChange={setHeadStart}
            className="mt-0.5"
          />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-1.5">
              <label
                htmlFor="head_start_checkbox"
                className="text-sm font-medium"
              >
                Give new customers a head start
              </label>
              <InfoTooltip
                ariaLabel="Why give a head start?"
                trigger="tap"
                content={
                  <>
                    New signups start with a small amount of free progress
                    toward their first reward — shown to measurably increase
                    completion.
                  </>
                }
              />
            </div>
            {headStart && (type === "stamp" || type === "plant") && (
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="head_start_percent"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Head start amount
                </Label>
                <Input
                  id="head_start_percent"
                  type="number"
                  min={5}
                  max={50}
                  value={headStartPercent}
                  onChange={(e) => setHeadStartPercent(Number(e.target.value))}
                  className="h-9 w-20 rounded-lg"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            )}
          </div>
          <input
            type="hidden"
            name="head_start"
            value={headStart ? "true" : "false"}
          />
          {headStart && (type === "stamp" || type === "plant") && (
            <input
              type="hidden"
              name="head_start_percent"
              value={headStartPercent}
            />
          )}
        </div>
      )}
    </>
  );
}

function creationLabel(
  replacingId: SetupFormProps["replacingId"],
  prepping: SetupFormProps["prepping"],
) {
  if (replacingId) {
    return "Change type";
  }
  return prepping ? "Save as draft" : "Create card";
}
