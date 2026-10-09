export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Snapshot only; consumers choose whether preference changes need a subscription. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
