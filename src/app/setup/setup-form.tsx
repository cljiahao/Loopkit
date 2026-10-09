"use client";
import type { SetupFormProps } from "./use-setup-form-state";
import { SetupRulesFields } from "./setup-rules-fields";
import { SetupPointsFields } from "./setup-points-fields";
import { SetupBasicsFields } from "./setup-basics-fields";

import { useSetupFormState } from "./use-setup-form-state";

import Link from "next/link";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import { PreviewCard } from "@/app/setup/preview-card";
import { Section } from "@/components/section";

import { ColorPicker } from "@/components/color-picker";
import {
  Tag,
  Image as ImageIcon,
  Gift,
  Coffee,
  Star,
  Heart,
  Ticket,
  Palette,
  Lock,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StampVisualStyle } from "@/components/stamp-dots";
import { DEFAULT_STAMP_COLOR } from "@/lib/engine/stamp";
import type { ScratchCoverStyle } from "@/lib/program-config";
import { FAMILIES, familyOf } from "@/app/setup/card-type-picker";

type TypeOptionValue =
  | "stamp"
  | "flame"
  | "points"
  | "lucky"
  | "plant"
  | "cup"
  | "wheel"
  | "scratch";

const typeLabels: Record<TypeOptionValue, string> = {
  stamp: "Stamp card",
  flame: "Flame Club",
  points: "Points Club",
  lucky: "Lucky Tap",
  plant: "Sprout",
  cup: "Fill the Cup",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
};

// A locked-option marker, not a Link: every call site already sits inside a button/toggle item.
function ProBadge() {
  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-1.5 py-0.5 text-[0.65rem] font-semibold text-primary">
      <Lock className="size-2.5" />
      Pro
    </span>
  );
}

export function SetupForm({
  program,
  isEdit,
  replacingId,
  replacingType,
  prepping = false,
  vendorAvatarUrl = null,
  cardCount = 0,
  allowedFamilies = ["stamp"],
  allowedStampStyles = ["dots"],
  allowedCustomColor = false,
}: SetupFormProps) {
  const controller = useSetupFormState({
    program,
    isEdit,
    replacingId,
    replacingType,
    prepping,
    vendorAvatarUrl,
    cardCount,
    allowedFamilies,
    allowedStampStyles,
    allowedCustomColor,
  });
  const {
    formAction,
    type,
    variant,
    selectedOptionKey,
    familyStep,
    setFamilyStep,
    currentFamilyAndStyle,
    name,
    rewardText,
    stampMarkMode,
    setStampMarkMode,
    stampMarkPreset,
    setStampMarkPreset,
    scratchCoverStyle,
    setScratchCoverStyle,
    stampStyle,
    setStampStyle,
    stampColor,
    setStampColor,
    isCreateFlow,
    step,
    setStep,
    showAdvanced,
    setShowAdvanced,
    basicsValid,
    stepLabels,
    previewProgress,
    celebrating,
    revealing,
    lastChanceResult,
    pickStyle,
    pickFamily,
  } = controller;

  const preview = (
    <PreviewCard
      progress={previewProgress}
      name={name}
      rewardText={rewardText}
      celebrating={celebrating}
      revealing={revealing}
      lastChanceResult={lastChanceResult}
      vendorAvatarUrl={vendorAvatarUrl}
    />
  );

  const typePicker = isEdit ? (
    <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
      {typeLabels[selectedOptionKey]}
    </p>
  ) : familyStep === "family" ? (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {FAMILIES.map((family) => (
        <button
          key={family.key}
          type="button"
          aria-label={family.label}
          onClick={() => pickFamily(family.key)}
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
            currentFamilyAndStyle.family === family.key
              ? "border-primary bg-primary/10"
              : "bg-card hover:bg-muted/50",
          )}
        >
          <span className="flex w-full items-center">
            <span className="text-sm font-semibold">{family.label}</span>
            {!allowedFamilies.includes(family.key) && <ProBadge />}
          </span>
          <span className="text-xs text-muted-foreground">
            {family.description}
          </span>
          {family.styles.length > 1 ? (
            <span className="mt-1 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground/70">
              {family.styles.length} styles
            </span>
          ) : null}
        </button>
      ))}
    </div>
  ) : (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setFamilyStep("family")}
        className="text-xs font-medium text-primary hover:underline"
      >
        ← Back
      </button>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {familyOf(familyStep).styles.map((style) => (
          <button
            key={style.key}
            type="button"
            aria-label={style.label}
            onClick={() => pickStyle(style.key)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
              currentFamilyAndStyle.style === style.key
                ? "border-primary bg-primary/10"
                : "bg-card hover:bg-muted/50",
            )}
          >
            <span className="flex w-full items-center">
              <span className="text-sm font-semibold">{style.label}</span>
              {!allowedFamilies.includes(familyStep) && <ProBadge />}
            </span>
            <span className="text-xs text-muted-foreground">
              {style.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <form action={formAction} className="space-y-6">
        {program ? <input type="hidden" name="id" value={program.id} /> : null}
        {replacingId ? (
          <input type="hidden" name="replacing" value={replacingId} />
        ) : null}
        <input type="hidden" name="type" value={type} />
        {type === "stamp" || type === "plant" ? (
          <input type="hidden" name="variant" value={variant} />
        ) : null}

        {isCreateFlow && (
          <ol className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {stepLabels.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true">→</span>}
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1",
                    i === step
                      ? "bg-primary/10 text-primary"
                      : i < step
                        ? "text-foreground"
                        : "",
                  )}
                >
                  {i + 1}. {label}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div hidden={isCreateFlow && step !== 0}>
          <Section
            icon={<Tag className="size-4" />}
            eyebrow="Every card needs this"
            title="Choose a card type"
            description="Pick a family, then a style."
          >
            {typePicker}
            <div className="lg:hidden">{preview}</div>
          </Section>
          {isCreateFlow && (
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setStep(1)}>
                Next: Basics
              </Button>
            </div>
          )}
        </div>

        <div hidden={isCreateFlow && step !== 1}>
          <SetupBasicsFields controller={controller} />
          {isCreateFlow && (
            <div className="mt-4 flex justify-between">
              <Button type="button" variant="ghost" onClick={() => setStep(0)}>
                ← Back
              </Button>
              <Button
                type="button"
                disabled={!basicsValid}
                onClick={() => setStep(2)}
              >
                Next: Rules
              </Button>
            </div>
          )}
        </div>

        <div hidden={isCreateFlow && step !== 2}>
          {isCreateFlow &&
            !showAdvanced &&
            type === "stamp" &&
            variant === "dots" && (
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Show advanced options (stamp mark)
              </button>
            )}
          {(showAdvanced || !isCreateFlow) &&
            type === "stamp" &&
            variant === "dots" && (
              <Section
                icon={<ImageIcon className="size-4" />}
                eyebrow="Optional"
                title="Stamp mark"
                description="What appears on each stamp instead of a plain dot."
              >
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={stampMarkMode}
                  onValueChange={(v) =>
                    v && setStampMarkMode(v as "dot" | "preset" | "photo")
                  }
                  className="justify-start"
                >
                  <ToggleGroupItem value="dot">Plain dot</ToggleGroupItem>
                  <ToggleGroupItem value="preset">Preset icon</ToggleGroupItem>
                  <ToggleGroupItem value="photo" disabled={!vendorAvatarUrl}>
                    My photo
                  </ToggleGroupItem>
                </ToggleGroup>
                {stampMarkMode === "photo" && !vendorAvatarUrl && (
                  <p className="text-xs text-muted-foreground">
                    Add a profile photo first, from your{" "}
                    <Link href="/dashboard/profile" className="underline">
                      profile page
                    </Link>
                    .
                  </p>
                )}
                {stampMarkMode === "preset" && (
                  <div className="flex gap-2">
                    {(
                      [
                        ["gift", Gift],
                        ["coffee", Coffee],
                        ["star", Star],
                        ["heart", Heart],
                      ] as const
                    ).map(([key, Icon]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setStampMarkPreset(key)}
                        aria-label={key}
                        className={cn(
                          "flex size-11 items-center justify-center rounded-xl border transition-colors",
                          stampMarkPreset === key
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-card text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="hidden"
                  name="stamp_mark_mode"
                  value={stampMarkMode}
                />
                {stampMarkMode === "preset" && (
                  <input
                    type="hidden"
                    name="stamp_mark_preset"
                    value={stampMarkPreset}
                  />
                )}
              </Section>
            )}

          {type === "stamp" && variant === "dots" && (
            <Section
              icon={<Palette className="size-4" />}
              title="Stamp style"
              description="What each stamp looks like, and its accent color."
            >
              <ToggleGroup
                type="single"
                variant="outline"
                value={stampStyle}
                onValueChange={(v) => v && setStampStyle(v as StampVisualStyle)}
                className="flex-wrap justify-start"
              >
                <ToggleGroupItem value="dots">Classic dots</ToggleGroupItem>
                <ToggleGroupItem value="seal">
                  Wax seal
                  {!allowedStampStyles.includes("seal") && (
                    <Lock className="ml-1 inline size-3" />
                  )}
                </ToggleGroupItem>
                <ToggleGroupItem value="ink">
                  Ink stamp
                  {!allowedStampStyles.includes("ink") && (
                    <Lock className="ml-1 inline size-3" />
                  )}
                </ToggleGroupItem>
                <ToggleGroupItem value="punch">
                  Punch hole
                  {!allowedStampStyles.includes("punch") && (
                    <Lock className="ml-1 inline size-3" />
                  )}
                </ToggleGroupItem>
                <ToggleGroupItem value="charm">
                  Charm trail
                  {!allowedStampStyles.includes("charm") && (
                    <Lock className="ml-1 inline size-3" />
                  )}
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="flex items-center gap-2">
                <ColorPicker
                  label="Stamp color"
                  value={stampColor ?? DEFAULT_STAMP_COLOR}
                  onChange={setStampColor}
                />
                <span className="text-xs text-muted-foreground">
                  Accent color — the reward stamp always stays gold.
                  {!allowedCustomColor && " Custom colors need Pro."}
                </span>
              </div>
              <input type="hidden" name="stamp_style" value={stampStyle} />
              <input
                type="hidden"
                name="stamp_color"
                value={stampColor ?? ""}
              />
            </Section>
          )}

          {type === "stamp" && variant === "points" && (
            <SetupPointsFields controller={controller} />
          )}

          {type === "scratch" && (
            <Section
              icon={<Ticket className="size-4" />}
              title="Scratch cover"
              description="What the customer scratches through to reveal their prize."
            >
              <ToggleGroup
                type="single"
                variant="outline"
                value={scratchCoverStyle}
                onValueChange={(v) =>
                  v && setScratchCoverStyle(v as ScratchCoverStyle)
                }
                className="justify-start"
              >
                <ToggleGroupItem value="foil">Gold foil</ToggleGroupItem>
                <ToggleGroupItem value="wax">Sealing wax</ToggleGroupItem>
                <ToggleGroupItem value="ticket">Ticket stub</ToggleGroupItem>
              </ToggleGroup>
              <input
                type="hidden"
                name="scratch_cover_style"
                value={scratchCoverStyle}
              />
            </Section>
          )}

          <SetupRulesFields
            controller={controller}
            program={program}
            isEdit={isEdit}
            replacingId={replacingId}
            prepping={prepping}
          />
        </div>
      </form>

      <div className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
        {preview}
      </div>
    </div>
  );
}
