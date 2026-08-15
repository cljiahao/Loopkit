import type { ReactNode } from "react";
import { Check, Gift, Coffee, Star, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export type StampMarkPreset = "gift" | "coffee" | "star" | "heart";
export type StampMark =
  { kind: "preset"; key: StampMarkPreset } | { kind: "photo"; url: string };

const PRESET_ICONS: Record<StampMarkPreset, typeof Gift> = {
  gift: Gift,
  coffee: Coffee,
  star: Star,
  heart: Heart,
};

export function StampDots({
  filled,
  total,
  mark,
  className,
}: {
  filled: number;
  total: number;
  mark?: StampMark;
  className?: string;
}) {
  return (
    <div className={cn("grid w-fit grid-cols-5 gap-2", className)}>
      {Array.from({ length: total }, (_, i) => {
        const isReward = i === total - 1;
        const stamped = i < filled;
        const justStamped = stamped && i === filled - 1;
        const PresetIcon =
          mark?.kind === "preset" ? PRESET_ICONS[mark.key] : null;

        let dotClassName = "border-dashed border-muted-foreground/30";
        if (isReward) {
          dotClassName = "border-gold text-gold-accent";
        } else if (stamped) {
          dotClassName = "border-transparent bg-gold text-gold-foreground";
        }

        let icon: ReactNode = null;
        if (isReward) {
          icon = <Gift className="size-3.5 text-gold" />;
        } else if (mark?.kind === "photo") {
          icon = (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mark.url}
              alt=""
              className={cn(
                "size-full object-cover",
                !stamped && "opacity-40 grayscale",
              )}
            />
          );
        } else if (PresetIcon) {
          icon = (
            <PresetIcon
              className={cn("size-3.5", !stamped && "opacity-40 grayscale")}
            />
          );
        } else if (stamped) {
          icon = <Check className="size-3.5" />;
        }

        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "flex size-7 items-center justify-center overflow-hidden rounded-full border-2 text-sm",
              dotClassName,
              justStamped && "motion-safe:animate-stamp-pop",
            )}
          >
            {icon}
          </span>
        );
      })}
    </div>
  );
}
