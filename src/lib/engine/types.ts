export type EngineEvent = {
  kind: "visit" | "redeem";
  payload?: Record<string, unknown>;
};

export type ProgressView =
  | { kind: "dots"; filled: number; total: number }
  | {
      kind: "plant";
      stage: number;
      stageName: string;
      totalStages: number;
      wilting: boolean;
    }
  | {
      kind: "chance";
      variant: "wheel" | "scratch";
      segments: { id: string; label: string; reward: boolean }[];
      landedId: string | null;
    };

export type Progress = {
  stage: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
};

export interface Strategy<C, S> {
  defaults(config: C): S;
  progress(state: S, config: C, now: Date): Progress;
  apply(
    event: EngineEvent,
    state: S,
    config: C,
    now: Date,
  ): { state: S; rewardUnlocked: boolean };
  redeem(state: S, config: C): S;
}
