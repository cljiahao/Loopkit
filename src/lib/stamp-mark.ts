import type { ProgressView } from "@/lib/engine/types";
import type { StampMark } from "@/components/stamp-dots";

// Shared by /c (program-card-status.tsx) and /setup's live preview
// (preview-card.tsx) so both resolve a stamp's mark identically: the
// engine's dots view carries the vendor's chosen mode/preset (config-only,
// no vendor identity), while the actual photo URL is vendor-level data
// each render call site fetches separately.
export function resolveStampMark(
  view: ProgressView,
  vendorAvatarUrl: string | null,
): StampMark | undefined {
  if (view.kind !== "dots" || view.variant === "points") return undefined;
  if (view.markMode === "photo" && vendorAvatarUrl) {
    return { kind: "photo", url: vendorAvatarUrl };
  }
  if (view.markMode === "preset" && view.markPreset) {
    return { kind: "preset", key: view.markPreset };
  }
  return undefined;
}
