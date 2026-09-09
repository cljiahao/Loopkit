export type ProgramSnapshot = {
  stamps_required: number;
  reward_text: string;
};

function rewardChanged(
  before: ProgramSnapshot,
  after: ProgramSnapshot,
): boolean {
  return before.reward_text.trim() !== after.reward_text.trim();
}

export function isProgressAffecting(
  before: ProgramSnapshot,
  after: ProgramSnapshot,
): boolean {
  return (
    before.stamps_required !== after.stamps_required ||
    rewardChanged(before, after)
  );
}

export function describeEditImpact(
  before: ProgramSnapshot,
  after: ProgramSnapshot,
  cardCount: number,
): string[] {
  const lines: string[] = [];

  const noun = cardCount === 1 ? "customer has" : "customers have";
  lines.push(`${cardCount} ${noun} a card on this program.`);

  if (after.stamps_required > before.stamps_required) {
    lines.push(
      `They keep the stamps they have. The goal moves from ${before.stamps_required} to ${after.stamps_required}.`,
    );
  } else if (after.stamps_required < before.stamps_required) {
    lines.push(
      `They keep the stamps they have. The goal drops from ${before.stamps_required} to ${after.stamps_required}, so some may already have earned a reward.`,
    );
  }

  if (rewardChanged(before, after)) {
    lines.push(
      `Rewards already earned keep the current wording. New rewards will read "${after.reward_text.trim()}".`,
    );
  }

  return lines;
}
