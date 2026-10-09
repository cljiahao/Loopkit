import type { ProgressView } from "@/lib/engine/types";
import type { StampMark } from "@/components/stamp-dots";

// Photo marks combine engine configuration with caller-supplied vendor identity.
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
