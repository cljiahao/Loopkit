import type { StampCard } from "@/app/dashboard/card";

// The Counter's active-card state. Unchanged from the original inline union in
// serve-customer.tsx, lifted here so both serve-customer and active-card share
// one definition.
export type PlantView = {
  kind: "plant";
  stage: number;
  stageName: string;
  totalStages: number;
  wilting: boolean;
  variant: "plant" | "cup";
};

export type ChanceView = {
  kind: "chance";
  variant: "wheel" | "scratch";
  segments: { id: string; label: string; reward: boolean }[];
  landedId: string | null;
};

export type ServeResult =
  | { mode: "stamp"; phone: string; card: StampCard; rewardReady: boolean }
  | {
      mode: "lucky";
      phone: string;
      played: boolean;
      won: boolean;
      label: string;
    }
  | {
      mode: "plant";
      phone: string;
      view: PlantView;
      label: string;
      rewardReady: boolean;
      rewardUnlocked: boolean;
    }
  | {
      mode: "chance";
      phone: string;
      view: ChanceView;
      label: string;
      wonThisTime: boolean;
      rewardText: string;
    };
