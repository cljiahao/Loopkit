// Pure: pick which program the Counter opens on when the URL has no `p`.
// The id with the highest active-card count, ties toward the earlier entry,
// the first program when every count is zero or missing, null when empty.
export function pickDefaultCounterProgram(
  programs: { id: string }[],
  activeCountById: Record<string, number>,
): string | null {
  if (programs.length === 0) return null;
  let best = programs[0].id;
  let bestCount = activeCountById[best] ?? 0;
  for (const p of programs) {
    const count = activeCountById[p.id] ?? 0;
    if (count > bestCount) {
      best = p.id;
      bestCount = count;
    }
  }
  return best;
}
