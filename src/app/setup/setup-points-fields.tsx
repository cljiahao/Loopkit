"use client";

import { Input } from "@/components/ui/input";

import { Section } from "@/components/section";

import { Coins } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import type { PointsRedemptionMode } from "@/lib/program-config";

import type { SetupFormState } from "./use-setup-form-state";

export function SetupPointsFields({
  controller,
}: {
  controller: Pick<
    SetupFormState,
    | "pointsRedemptionMode"
    | "setPointsRedemptionMode"
    | "pointsCatalog"
    | "offsetRatePoints"
    | "setOffsetRatePoints"
    | "offsetRateDollars"
    | "setOffsetRateDollars"
    | "updatePointsCatalogItem"
    | "addPointsCatalogItem"
    | "removePointsCatalogItem"
  >;
}) {
  const {
    pointsRedemptionMode,
    setPointsRedemptionMode,
    pointsCatalog,
    offsetRatePoints,
    setOffsetRatePoints,
    offsetRateDollars,
    setOffsetRateDollars,
    updatePointsCatalogItem,
    addPointsCatalogItem,
    removePointsCatalogItem,
  } = controller;
  return (
    <Section
      icon={<Coins className="size-4" />}
      title="Points redemption"
      description="How a customer spends their points once they have enough."
    >
      <ToggleGroup
        type="single"
        variant="outline"
        value={pointsRedemptionMode}
        onValueChange={(v) =>
          v && setPointsRedemptionMode(v as PointsRedemptionMode)
        }
        className="justify-start"
      >
        <ToggleGroupItem value="catalog">Reward catalog</ToggleGroupItem>
        <ToggleGroupItem value="offset">Points = cash</ToggleGroupItem>
      </ToggleGroup>

      {pointsRedemptionMode === "catalog" ? (
        <div className="space-y-2">
          {pointsCatalog.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border p-2"
            >
              <Input
                type="text"
                required
                maxLength={40}
                value={item.label}
                onChange={(e) =>
                  updatePointsCatalogItem(i, { label: e.target.value })
                }
                placeholder="Reward"
                className="h-11 flex-1 rounded-xl"
              />
              <Input
                type="number"
                required
                min={1}
                max={100000}
                value={item.cost}
                onChange={(e) =>
                  updatePointsCatalogItem(i, {
                    cost: Number(e.target.value),
                  })
                }
                aria-label="Point cost"
                className="h-11 w-24 rounded-xl"
              />
              <button
                type="button"
                onClick={() => removePointsCatalogItem(i)}
                disabled={pointsCatalog.length <= 2}
                className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPointsCatalogItem}
            disabled={pointsCatalog.length >= 6}
            className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
          >
            Add reward
          </button>
          <input
            type="hidden"
            name="catalog"
            value={JSON.stringify(pointsCatalog)}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            required
            min={1}
            max={100000}
            value={offsetRatePoints}
            onChange={(e) => setOffsetRatePoints(Number(e.target.value))}
            aria-label="Points"
            className="h-11 w-24 rounded-xl"
          />
          <span className="text-sm text-muted-foreground">points =</span>
          <Input
            type="number"
            required
            min={0.01}
            step={0.01}
            max={100000}
            value={offsetRateDollars}
            onChange={(e) => setOffsetRateDollars(Number(e.target.value))}
            aria-label="Dollars off"
            className="h-11 w-24 rounded-xl"
          />
          <span className="text-sm text-muted-foreground">off</span>
          <input
            type="hidden"
            name="offset_rate_points"
            value={offsetRatePoints}
          />
          <input
            type="hidden"
            name="offset_rate_dollars"
            value={offsetRateDollars}
          />
        </div>
      )}
      <input
        type="hidden"
        name="redemption_mode"
        value={pointsRedemptionMode}
      />
    </Section>
  );
}
