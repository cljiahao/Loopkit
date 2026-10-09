import {
  cardsNearReward,
  regularsGoneQuiet,
  type OverviewCard,
} from "@/lib/stats";

export const OVERVIEW_COHORTS = ["gone-quiet", "one-away", "two-away"] as const;
export type OverviewCohort = (typeof OVERVIEW_COHORTS)[number];

export function parseOverviewCohort(
  value: string | undefined,
): OverviewCohort | null {
  return OVERVIEW_COHORTS.find((cohort) => cohort === value) ?? null;
}

export function overviewCohortCardIds(
  cohort: OverviewCohort,
  programs: { id: string; stamps_required: number }[],
  inputs: {
    cards: OverviewCard[];
    activityEvents: Parameters<typeof regularsGoneQuiet>[0];
  },
  nowMs: number,
): Set<string> {
  if (cohort === "gone-quiet")
    return new Set(regularsGoneQuiet(inputs.activityEvents, nowMs).cardIds);
  const thresholds = new Map(
    programs.map((program) => [program.id, program.stamps_required]),
  );
  return new Set(
    inputs.cards
      .filter((card) => {
        const threshold = thresholds.get(card.program_id);
        if (threshold === undefined) return false;
        const near = cardsNearReward([card], threshold);
        return cohort === "one-away" ? near.oneAway > 0 : near.twoAway > 0;
      })
      .map((card) => card.id),
  );
}
