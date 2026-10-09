"use client";

import { useActionState, useState } from "react";
import {
  saveProgramAction,
  changeTypeAction,
  prepProgramAction,
} from "@/app/setup/actions";
import type { Program, ProgramType } from "@/lib/program";

import { usePreviewAnimation } from "@/app/setup/preview-animation";

import {
  isProgressAffecting,
  describeEditImpact,
  type ProgramSnapshot,
} from "@/lib/program-edit-impact";

import type {
  StampMarkPreset,
  StampVisualStyle,
} from "@/components/stamp-dots";

import type {
  ScratchCoverStyle,
  PointsRedemptionMode,
  PointsCatalogItemInput,
} from "@/lib/program-config";
import {
  familyOf,
  isSingleStyleFamily,
  resolveFamilyAndStyle,
  styleToTypeAndVariant,
  type FamilyKey,
  type StyleKey,
} from "@/app/setup/card-type-picker";
import { segmentWinPercent, overallWinPercent } from "@/lib/program-config";

type SegmentInput = {
  label: string;
  weight: number;
  is_reward: boolean;
  color?: string;
};

type TypeOptionValue =
  | "stamp"
  | "flame"
  | "points"
  | "lucky"
  | "plant"
  | "cup"
  | "wheel"
  | "scratch";

const DEFAULT_SEGMENTS: SegmentInput[] = [
  { label: "Try again", weight: 5, is_reward: false },
  { label: "Free item", weight: 1, is_reward: true },
];

const DEFAULT_POINTS_CATALOG: PointsCatalogItemInput[] = [
  { label: "Free drink", cost: 100 },
  { label: "Free meal", cost: 300 },
];

export type SetupFormProps = {
  program: Program | null;
  isEdit: boolean;
  replacingId: string | null;
  replacingType: string | null;
  prepping?: boolean;
  vendorAvatarUrl?: string | null;
  cardCount?: number;
  allowedFamilies?: FamilyKey[];
  allowedStampStyles?: StampVisualStyle[];
  allowedCustomColor?: boolean;
};

function selectSetupAction(replacingId: string | null, prepping: boolean) {
  if (replacingId) return changeTypeAction;
  return prepping ? prepProgramAction : saveProgramAction;
}
function initialProgramType(program: Program | null): ProgramType {
  const type = program?.type;
  if (
    type === "lucky" ||
    type === "plant" ||
    type === "wheel" ||
    type === "scratch"
  )
    return type;
  return "stamp";
}
function optionKey(type: ProgramType, variant: string): TypeOptionValue {
  if (type === "stamp" && variant === "flame") return "flame";
  if (type === "stamp" && variant === "points") return "points";
  if (type === "plant" && variant === "cup") return "cup";
  return type;
}
function programGoal(
  type: ProgramType,
  visitsToBloom: number,
  pityCeiling: number | undefined,
  stampsRequired: number,
) {
  if (type === "plant") return visitsToBloom;
  if (type === "lucky" || type === "wheel" || type === "scratch")
    return pityCeiling ?? 10;
  return stampsRequired;
}
function defaultStampGoal(style: StyleKey) {
  if (style === "points") return 500;
  return style === "flame" ? 5 : 10;
}

export function useSetupFormState({
  program,
  isEdit,
  replacingId,
  replacingType,
  prepping = false,
  cardCount = 0,
}: SetupFormProps) {
  const [state, formAction, pending] = useActionState(
    selectSetupAction(replacingId, prepping),
    {},
  );
  const initialType = initialProgramType(program);
  const [type, setType] = useState<ProgramType>(initialType);

  const config = (program?.config ?? {}) as {
    win_probability?: number;
    pity_ceiling?: number;
    reward_text?: string;
    stages?: { threshold: number }[];
    segments?: {
      label: string;
      weight: number;
      reward_text?: string;
      color?: string;
    }[];
    variant?: string;
    stamp_mark?: { mode?: string; preset?: string };
    scratch_cover_style?: string;
    stamp_style?: string;
    stamp_color?: string;
    redemption_mode?: string;
    catalog?: { id?: string; label?: string; cost?: number }[];
    offset_rate?: { points?: number; dollars?: number };
  };

  const [variant, setVariant] = useState<
    "dots" | "flame" | "points" | "plant" | "cup"
  >(() => {
    if (config.variant === "flame") return "flame";
    if (config.variant === "points") return "points";
    if (config.variant === "cup") return "cup";
    return initialType === "plant" ? "plant" : "dots";
  });
  const selectedOptionKey = optionKey(type, variant);

  // Step 1 shows the 4 family tiles; picking a multi-style family switches
  // to that family's style tiles (Step 2). "family" means Step 1 is showing.
  const [familyStep, setFamilyStep] = useState<"family" | FamilyKey>("family");
  const currentFamilyAndStyle = resolveFamilyAndStyle(type, variant);

  // Every field below is controlled — the same state drives both form
  // submission and the live preview, updated on every keystroke.
  const [name, setName] = useState(program?.name ?? "");
  const [rewardText, setRewardText] = useState(
    program?.reward_text ?? config.reward_text ?? "",
  );
  const [stampsRequired, setStampsRequired] = useState(
    program?.stamps_required ?? 10,
  );
  const [pointsPerVisit, setPointsPerVisit] = useState(
    (config as { points_per_visit?: number }).points_per_visit ?? 10,
  );
  const [stampMarkMode, setStampMarkMode] = useState<
    "dot" | "preset" | "photo"
  >(
    (config.stamp_mark?.mode as "dot" | "preset" | "photo" | undefined) ??
      "dot",
  );
  const [stampMarkPreset, setStampMarkPreset] = useState<StampMarkPreset>(
    (config.stamp_mark?.preset as StampMarkPreset | undefined) ?? "gift",
  );
  const [visitsToBloom, setVisitsToBloom] = useState(
    config.stages?.[config.stages.length - 1]?.threshold ?? 6,
  );
  const [winPercent, setWinPercent] = useState(
    config.win_probability ? Math.round(config.win_probability * 100) : 20,
  );
  const [pityCeiling, setPityCeiling] = useState<number | undefined>(
    config.pity_ceiling,
  );
  const [scratchCoverStyle, setScratchCoverStyle] = useState<ScratchCoverStyle>(
    (config.scratch_cover_style as ScratchCoverStyle | undefined) ?? "foil",
  );
  const [stampStyle, setStampStyle] = useState<StampVisualStyle>(
    (config.stamp_style as StampVisualStyle | undefined) ?? "dots",
  );
  const [stampColor, setStampColor] = useState<string | undefined>(
    config.stamp_color,
  );
  const [pointsRedemptionMode, setPointsRedemptionMode] =
    useState<PointsRedemptionMode>(
      (config.redemption_mode as PointsRedemptionMode | undefined) ?? "catalog",
    );
  const [pointsCatalog, setPointsCatalog] = useState<PointsCatalogItemInput[]>(
    (config.catalog as PointsCatalogItemInput[] | undefined) ??
      DEFAULT_POINTS_CATALOG,
  );
  const [offsetRatePoints, setOffsetRatePoints] = useState(
    (config.offset_rate as { points?: number } | undefined)?.points ?? 100,
  );
  const [offsetRateDollars, setOffsetRateDollars] = useState(
    (config.offset_rate as { dollars?: number } | undefined)?.dollars ?? 1,
  );

  const [segments, setSegments] = useState<SegmentInput[]>(
    config.segments?.map((s) => ({
      label: s.label,
      weight: s.weight,
      is_reward: !!s.reward_text,
      color: s.color,
    })) ?? DEFAULT_SEGMENTS,
  );
  const segmentOddsPercent = segmentWinPercent(segments);
  const overallOddsPercent = overallWinPercent(segments);
  const [headStart, setHeadStart] = useState(program?.head_start ?? false);
  const [headStartPercent, setHeadStartPercent] = useState(
    program?.head_start_percent ?? 20,
  );
  const [carryOverStamps, setCarryOverStamps] = useState(false);
  const showCarryOverOption =
    replacingId !== null && replacingType === "stamp" && type === "stamp";
  const [birthdayBonusEnabled, setBirthdayBonusEnabled] = useState(
    program?.birthday_bonus_enabled ?? false,
  );

  // First-run onboarding gets a real step sequence to cut decision load;
  // editing an existing program, a scheduled type-change, or a live
  // type-swap keep the original single-page layout unchanged — those
  // vendors already know this form. Fields stay mounted across steps
  // (CSS-hidden, not unmounted) so nothing loses its value on Back/Next.
  const isCreateFlow = !isEdit && !replacingId && !prepping;
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [showAdvanced, setShowAdvanced] = useState(!isCreateFlow);
  const basicsValid = name.trim().length > 0;
  const stepLabels = ["Type", "Basics", "Rules"] as const;

  const resolvedGoal = programGoal(
    type,
    visitsToBloom,
    pityCeiling,
    stampsRequired,
  );
  const goalUsable = Number.isInteger(resolvedGoal) && resolvedGoal >= 2;
  const editImpactLines: string[] | null =
    isEdit && program !== null && cardCount > 0 && goalUsable
      ? (() => {
          const before: ProgramSnapshot = {
            stamps_required: program.stamps_required,
            reward_text: program.reward_text,
          };
          const after: ProgramSnapshot = {
            stamps_required: resolvedGoal,
            reward_text: rewardText,
          };
          return isProgressAffecting(before, after)
            ? describeEditImpact(before, after, cardCount)
            : null;
        })()
      : null;

  const {
    progress: previewProgress,
    celebrating,
    revealing,
    lastChanceResult,
  } = usePreviewAnimation({
    type,
    name,
    rewardText,
    stampsRequired,
    visitsToBloom,
    winPercent,
    pityCeiling,
    segments,
    headStart,
    headStartPercent,
    variant,
    pointsPerVisit,
    stampMarkMode,
    stampMarkPreset,
    scratchCoverStyle,
    stampStyle,
    stampColor,
    pointsRedemptionMode:
      variant === "points" ? pointsRedemptionMode : undefined,
    pointsCatalog:
      variant === "points" && pointsRedemptionMode === "catalog"
        ? pointsCatalog
        : undefined,
    pointsOffsetRate:
      variant === "points" && pointsRedemptionMode === "offset"
        ? { points: offsetRatePoints, dollars: offsetRateDollars }
        : undefined,
  });

  // Sets the type plus its sensible numeric defaults, and always resets
  // name/rewardText to blank — the vendor types both themselves, no
  // suggested copy is ever prefilled on the create flow. Delegates the
  // style -> type/variant mapping to card-type-picker.ts so this file
  // doesn't duplicate it.
  function pickStyle(style: StyleKey) {
    const { type: nextType, variant: nextVariant } =
      styleToTypeAndVariant(style);
    setType(nextType);
    setVariant(nextVariant ?? "dots");
    setName("");
    setRewardText("");
    setStampsRequired(defaultStampGoal(style));
    setVisitsToBloom(5);
    setWinPercent(20);
    setPityCeiling(style === "lucky" ? 8 : undefined);
    setHeadStartPercent(20);
    setPointsPerVisit(10);
    setScratchCoverStyle("foil");
    setStampStyle("dots");
    setStampColor(undefined);
    setPointsRedemptionMode("catalog");
    setPointsCatalog(DEFAULT_POINTS_CATALOG);
    setOffsetRatePoints(100);
    setOffsetRateDollars(1);
  }

  // Clicking a family either completes the pick immediately (Lucky Tap has
  // exactly one style, so there's nothing to choose) or opens that
  // family's style tiles (Step 2).
  function pickFamily(family: FamilyKey) {
    if (isSingleStyleFamily(family)) {
      pickStyle(familyOf(family).styles[0].key);
      return;
    }
    setFamilyStep(family);
  }

  function updateSegment(index: number, patch: Partial<SegmentInput>) {
    setSegments((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function addSegment() {
    setSegments((prev) => [
      ...prev,
      { label: "New prize", weight: 1, is_reward: false },
    ]);
  }

  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePointsCatalogItem(
    index: number,
    patch: Partial<PointsCatalogItemInput>,
  ) {
    setPointsCatalog((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function addPointsCatalogItem() {
    setPointsCatalog((prev) => [...prev, { label: "New reward", cost: 100 }]);
  }

  function removePointsCatalogItem(index: number) {
    setPointsCatalog((prev) => prev.filter((_, i) => i !== index));
  }

  return {
    state,
    formAction,
    pending,
    type,
    variant,
    selectedOptionKey,
    familyStep,
    setFamilyStep,
    currentFamilyAndStyle,
    name,
    setName,
    rewardText,
    setRewardText,
    stampsRequired,
    setStampsRequired,
    pointsPerVisit,
    setPointsPerVisit,
    stampMarkMode,
    setStampMarkMode,
    stampMarkPreset,
    setStampMarkPreset,
    visitsToBloom,
    setVisitsToBloom,
    winPercent,
    setWinPercent,
    pityCeiling,
    setPityCeiling,
    scratchCoverStyle,
    setScratchCoverStyle,
    stampStyle,
    setStampStyle,
    stampColor,
    setStampColor,
    pointsRedemptionMode,
    setPointsRedemptionMode,
    pointsCatalog,
    offsetRatePoints,
    setOffsetRatePoints,
    offsetRateDollars,
    setOffsetRateDollars,
    segments,
    segmentOddsPercent,
    overallOddsPercent,
    headStart,
    setHeadStart,
    headStartPercent,
    setHeadStartPercent,
    carryOverStamps,
    setCarryOverStamps,
    showCarryOverOption,
    birthdayBonusEnabled,
    setBirthdayBonusEnabled,
    isCreateFlow,
    step,
    setStep,
    showAdvanced,
    setShowAdvanced,
    basicsValid,
    stepLabels,
    editImpactLines,
    previewProgress,
    celebrating,
    revealing,
    lastChanceResult,
    pickStyle,
    pickFamily,
    updateSegment,
    addSegment,
    removeSegment,
    updatePointsCatalogItem,
    addPointsCatalogItem,
    removePointsCatalogItem,
  };
}

export type SetupFormState = ReturnType<typeof useSetupFormState>;
