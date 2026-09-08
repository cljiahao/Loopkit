// SGD money helpers. The database stores integer cents
// (programs.reward_cost_cents and future reward-cost fields); forms collect
// dollars. Keep the conversion in one place so rounding stays consistent.

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

export function formatSgd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
