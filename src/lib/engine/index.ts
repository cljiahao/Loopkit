import type { Progress } from "@/lib/engine/types";
import {
  stampStrategy,
  type StampConfig,
  type StampState,
} from "@/lib/engine/stamp";

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

export function getProgress(
  program: ProgramLike,
  card: CardLike,
  now: Date,
): Progress {
  switch (program.type) {
    case "stamp":
    default:
      return stampStrategy.progress(
        resolveStampState(card),
        resolveStampConfig(program),
        now,
      );
  }
}
