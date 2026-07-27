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

        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "flex size-7 items-center justify-center overflow-hidden rounded-full border-2 text-sm",
              isReward
                ? "border-gold text-gold-accent"
                : stamped
                  ? "border-transparent bg-gold text-gold-foreground"
                  : "border-dashed border-muted-foreground/30",
              justStamped && "motion-safe:animate-stamp-pop",
            )}
          >
            {isReward ? (
              <Gift className="size-3.5 text-gold" />
            ) : mark?.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mark.url}
                alt=""
                className={cn(
                  "size-full object-cover",
                  !stamped && "opacity-40 grayscale",
                )}
              />
            ) : PresetIcon ? (
              <PresetIcon
                className={cn("size-3.5", !stamped && "opacity-40 grayscale")}
              />
            ) : stamped ? (
              <Check className="size-3.5" />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
