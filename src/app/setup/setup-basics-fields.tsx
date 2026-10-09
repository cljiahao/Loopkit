"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { cn } from "@/lib/utils";

import { Section } from "@/components/section";

import { InfoTooltip } from "@merqo/ui";
import { ColorPicker } from "@/components/color-picker";
import { Tag } from "lucide-react";

import type { SetupFormState } from "./use-setup-form-state";
const labelClass =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const DEFAULT_SEGMENT_COLOR = { reward: "#10b981", loss: "#fb7185" };

export function SetupBasicsFields({
  controller,
}: {
  controller: Pick<
    SetupFormState,
    | "type"
    | "variant"
    | "name"
    | "setName"
    | "rewardText"
    | "setRewardText"
    | "stampsRequired"
    | "setStampsRequired"
    | "pointsPerVisit"
    | "setPointsPerVisit"
    | "visitsToBloom"
    | "setVisitsToBloom"
    | "winPercent"
    | "setWinPercent"
    | "pityCeiling"
    | "setPityCeiling"
    | "segments"
    | "segmentOddsPercent"
    | "overallOddsPercent"
    | "updateSegment"
    | "addSegment"
    | "removeSegment"
  >;
}) {
  const { rewardText, setRewardText } = controller;
  return (
    <Section
      icon={<Tag className="size-4" />}
      eyebrow="Every card needs this"
      title="Basics"
      description="The name and reward customers see."
    >
      {<BasicMechanicFields controller={controller} />}

      <div className="space-y-2">
        <Label htmlFor="reward_text" className={labelClass}>
          Reward
        </Label>
        <Input
          id="reward_text"
          name="reward_text"
          type="text"
          required
          maxLength={80}
          placeholder="Free kopi"
          value={rewardText}
          onChange={(e) => setRewardText(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
    </Section>
  );
}

function BasicMechanicFields({
  controller,
}: {
  controller: Parameters<typeof SetupBasicsFields>[0]["controller"];
}) {
  if (controller.type === "stamp") {
    return <StampBasics controller={controller} />;
  }
  if (controller.type === "plant") {
    return <PlantBasics controller={controller} />;
  }
  return <ChanceBasics controller={controller} />;
}

function StampBasics({
  controller,
}: {
  controller: Pick<
    SetupFormState,
    | "variant"
    | "name"
    | "setName"
    | "stampsRequired"
    | "setStampsRequired"
    | "pointsPerVisit"
    | "setPointsPerVisit"
  >;
}) {
  const {
    variant,
    name,
    setName,
    stampsRequired,
    setStampsRequired,
    pointsPerVisit,
    setPointsPerVisit,
  } = controller;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name" className={labelClass}>
          Card name
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder="Coffee card"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      {variant === "points" ? (
        <input type="hidden" name="stamps_required" value={stampsRequired} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="stamps_required" className={labelClass}>
            {variant === "flame" ? "Visits for full blaze" : "Stamps required"}
          </Label>
          <Input
            id="stamps_required"
            name="stamps_required"
            type="number"
            required
            min={2}
            max={20}
            placeholder="10"
            value={stampsRequired}
            onChange={(e) => setStampsRequired(Number(e.target.value))}
            className="h-11 rounded-xl"
          />
          <div className="flex gap-1.5">
            {[5, 10, 15].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setStampsRequired(n)}
                className={cn(
                  "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                  stampsRequired === n
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-card text-muted-foreground hover:bg-muted/50",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      {variant === "points" && (
        <div className="space-y-2">
          <Label htmlFor="points_per_visit" className={labelClass}>
            Points per visit
          </Label>
          <Input
            id="points_per_visit"
            name="points_per_visit"
            type="number"
            required
            min={1}
            max={1000}
            placeholder="10"
            value={pointsPerVisit}
            onChange={(e) => setPointsPerVisit(Number(e.target.value))}
            className="h-11 rounded-xl"
          />
        </div>
      )}
    </div>
  );
}

function PlantBasics({
  controller,
}: {
  controller: Pick<
    SetupFormState,
    "variant" | "name" | "setName" | "visitsToBloom" | "setVisitsToBloom"
  >;
}) {
  const { variant, name, setName, visitsToBloom, setVisitsToBloom } =
    controller;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name" className={labelClass}>
          Card name
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder="Grow-a-kopi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="visits_to_bloom" className={labelClass}>
          {variant === "cup" ? "Visits to fill" : "Visits to bloom"}
        </Label>
        <Input
          id="visits_to_bloom"
          name="visits_to_bloom"
          type="number"
          required
          min={4}
          max={20}
          placeholder="5"
          value={visitsToBloom}
          onChange={(e) => setVisitsToBloom(Number(e.target.value))}
          className="h-11 rounded-xl"
        />
        <div className="flex gap-1.5">
          {[5, 10, 15].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setVisitsToBloom(n)}
              className={cn(
                "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                visitsToBloom === n
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground hover:bg-muted/50",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChanceBasics({
  controller,
}: {
  controller: Pick<
    SetupFormState,
    | "type"
    | "name"
    | "setName"
    | "winPercent"
    | "setWinPercent"
    | "pityCeiling"
    | "setPityCeiling"
    | "segments"
    | "segmentOddsPercent"
    | "overallOddsPercent"
    | "updateSegment"
    | "addSegment"
    | "removeSegment"
  >;
}) {
  const {
    type,
    name,
    setName,
    winPercent,
    setWinPercent,
    pityCeiling,
    setPityCeiling,
    segments,
    segmentOddsPercent,
    overallOddsPercent,
    updateSegment,
    addSegment,
    removeSegment,
  } = controller;
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="name" className={labelClass}>
          Card name
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          maxLength={60}
          placeholder={chancePlaceholder(type)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11 rounded-xl"
        />
      </div>

      {type === "wheel" || type === "scratch" ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className={labelClass}>
                {type === "wheel" ? "Wheel segments" : "Scratch prizes"}
              </Label>
              <InfoTooltip
                ariaLabel="What the number next to each prize means"
                trigger="tap"
                content={
                  <>
                    That&apos;s the odds weight — higher numbers land more often
                    relative to the other prizes.
                  </>
                }
              />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              Overall win chance: {overallOddsPercent}%
            </p>
            <div className="space-y-2">
              {segments.map((segment, i) => (
                <div key={i} className="space-y-1.5 rounded-xl border p-2">
                  <div className="flex items-center gap-2">
                    <ColorPicker
                      label={`${segment.label || "Segment"} color`}
                      value={
                        segment.color ??
                        (segment.is_reward
                          ? DEFAULT_SEGMENT_COLOR.reward
                          : DEFAULT_SEGMENT_COLOR.loss)
                      }
                      onChange={(color) => updateSegment(i, { color })}
                    />
                    <Input
                      type="text"
                      required
                      maxLength={40}
                      value={segment.label}
                      onChange={(e) =>
                        updateSegment(i, { label: e.target.value })
                      }
                      placeholder="Label"
                      className="h-11 flex-1 rounded-xl"
                    />
                    <button
                      type="button"
                      onClick={() => removeSegment(i)}
                      disabled={segments.length <= 2}
                      className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={segment.weight}
                      onChange={(e) =>
                        updateSegment(i, {
                          weight: Number(e.target.value),
                        })
                      }
                      aria-label="Odds weight"
                      className="h-11 w-20 rounded-xl"
                    />
                    <span className="text-xs font-medium text-muted-foreground">
                      ≈{segmentOddsPercent[i]}%
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateSegment(i, {
                          is_reward: !segment.is_reward,
                        })
                      }
                      className={cn(
                        "h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors",
                        segment.is_reward
                          ? "border-gold bg-gold/10 text-gold-accent"
                          : "bg-card text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      {segment.is_reward ? "Reward" : "No win"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addSegment}
              disabled={segments.length >= 6}
              className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
            >
              Add segment
            </button>
            <input
              type="hidden"
              name="segments"
              value={JSON.stringify(segments)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pity_ceiling" className={labelClass}>
              Guaranteed win by (optional)
            </Label>
            <Input
              id="pity_ceiling"
              name="pity_ceiling"
              type="number"
              min={2}
              max={20}
              placeholder="No guarantee"
              value={pityCeiling ?? ""}
              onChange={(e) =>
                setPityCeiling(
                  e.target.value === "" ? undefined : Number(e.target.value),
                )
              }
              className="h-11 rounded-xl"
            />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="win_percent" className={labelClass}>
              Win chance (%)
            </Label>
            <Input
              id="win_percent"
              name="win_percent"
              type="number"
              required
              min={2}
              max={100}
              placeholder="20"
              value={winPercent}
              onChange={(e) => setWinPercent(Number(e.target.value))}
              className="h-11 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pity_ceiling" className={labelClass}>
              Guaranteed win by
            </Label>
            <Input
              id="pity_ceiling"
              name="pity_ceiling"
              type="number"
              required
              min={2}
              max={20}
              placeholder="8"
              value={pityCeiling ?? 8}
              onChange={(e) => setPityCeiling(Number(e.target.value))}
              className="h-11 rounded-xl"
            />
          </div>
        </div>
      )}
    </>
  );
}

function chancePlaceholder(type: string) {
  if (type === "lucky") {
    return "Lucky topping";
  }
  return type === "wheel" ? "Spin to win" : "Scratch & win";
}
