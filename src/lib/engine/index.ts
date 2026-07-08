import type { EngineEvent, Progress } from "@/lib/engine/types";
import {
  stampStrategy,
  type StampConfig,
  type StampState,
} from "@/lib/engine/stamp";
import {
  luckyStrategy,
  type LuckyConfig,
  type LuckyState,
} from "@/lib/engine/lucky";
import {
  plantStrategy,
  type PlantConfig,
  type PlantState,
} from "@/lib/engine/plant";
import {
  makeChanceStrategy,
  type ChanceConfig,
  type ChanceState,
} from "@/lib/engine/chance";
import {
  streakStrategy,
  type StreakConfig,
  type StreakState,
} from "@/lib/engine/streak";

export type ProgramLike = {
  type: string;
  config: unknown;
  stamps_required: number;
  reward_text: string;
};
export type CardLike = {
  state: unknown;
  stamp_count: number;
  reward_count: number;
};

function hasKeys(o: unknown): o is Record<string, unknown> {
  return typeof o === "object" && o !== null && Object.keys(o).length > 0;
}

export function resolveStampConfig(program: ProgramLike): StampConfig {
  if (hasKeys(program.config)) return program.config as StampConfig;
  return {
    stamps_required: program.stamps_required,
    reward_text: program.reward_text,
  };
}

function resolveStampState(card: CardLike): StampState {
  if (hasKeys(card.state)) {
    const s = card.state as Partial<StampState>;
    return {
      stamp_count: s.stamp_count ?? card.stamp_count,
      reward_count: s.reward_count ?? card.reward_count,
    };
  }
  return { stamp_count: card.stamp_count, reward_count: card.reward_count };
}

function resolveLuckyConfig(program: ProgramLike): LuckyConfig {
  return program.config as LuckyConfig;
}

function resolveLuckyState(card: CardLike): LuckyState {
  if (hasKeys(card.state)) return card.state as LuckyState;
  return { visits_since_win: 0, total_wins: 0 };
}

function resolvePlantConfig(program: ProgramLike): PlantConfig {
  return program.config as PlantConfig;
}

export function resolvePlantState(card: CardLike): PlantState {
  if (hasKeys(card.state)) return card.state as PlantState;
  return plantStrategy.defaults({} as PlantConfig);
}

function resolveChanceConfig(program: ProgramLike): ChanceConfig {
  return program.config as ChanceConfig;
}

function resolveChanceState(
  card: CardLike,
  variant: "wheel" | "scratch",
): ChanceState {
  if (hasKeys(card.state)) return card.state as ChanceState;
  return makeChanceStrategy(variant).defaults({} as ChanceConfig);
}

function resolveStreakConfig(program: ProgramLike): StreakConfig {
  return program.config as StreakConfig;
}

export function resolveStreakState(card: CardLike): StreakState {
  if (hasKeys(card.state)) return card.state as StreakState;
  return streakStrategy.defaults({} as StreakConfig);
}

export function applyVisit(
  program: ProgramLike,
  card: CardLike,
  event: EngineEvent,
  now: Date,
): { state: unknown; rewardUnlocked: boolean } {
  switch (program.type) {
    case "lucky":
      return luckyStrategy.apply(
        event,
        resolveLuckyState(card),
        resolveLuckyConfig(program),
        now,
      );
    case "plant":
      return plantStrategy.apply(
        event,
        resolvePlantState(card),
        resolvePlantConfig(program),
        now,
      );
    case "wheel":
    case "scratch": {
      const variant = program.type as "wheel" | "scratch";
      return makeChanceStrategy(variant).apply(
        event,
        resolveChanceState(card, variant),
        resolveChanceConfig(program),
        now,
      );
    }
    case "streak":
      return streakStrategy.apply(
        event,
        resolveStreakState(card),
        resolveStreakConfig(program),
        now,
      );
    case "stamp":
    default:
      return stampStrategy.apply(
        event,
        resolveStampState(card),
        resolveStampConfig(program),
        now,
      );
  }
}

export function getProgress(
  program: ProgramLike,
  card: CardLike,
  now: Date,
): Progress {
  switch (program.type) {
    case "lucky":
      return luckyStrategy.progress(
        resolveLuckyState(card),
        resolveLuckyConfig(program),
        now,
      );
    case "plant":
      return plantStrategy.progress(
        resolvePlantState(card),
        resolvePlantConfig(program),
        now,
      );
    case "wheel":
    case "scratch": {
      const variant = program.type as "wheel" | "scratch";
      return makeChanceStrategy(variant).progress(
        resolveChanceState(card, variant),
        resolveChanceConfig(program),
        now,
      );
    }
    case "streak":
      return streakStrategy.progress(
        resolveStreakState(card),
        resolveStreakConfig(program),
        now,
      );
    case "stamp":
    default:
      return stampStrategy.progress(
        resolveStampState(card),
        resolveStampConfig(program),
        now,
      );
  }
}
