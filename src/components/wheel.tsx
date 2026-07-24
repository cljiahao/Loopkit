import { cn } from "@/lib/utils";

export function Wheel({
  segments,
  landedId,
  spinning,
  className,
}: {
  segments: { id: string; label: string; reward: boolean }[];
  landedId: string | null;
  spinning?: boolean;
  className?: string;
}) {
  const count = segments.length;
  const anglePerSegment = 360 / count;
  const landedIndex = landedId
    ? segments.findIndex((s) => s.id === landedId)
    : -1;
  const rotation =
    landedIndex >= 0
      ? 360 * 3 - (landedIndex * anglePerSegment + anglePerSegment / 2)
      : 0;

  return (
    <div className={cn("relative inline-block size-32", className)}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-32">
        <g
          style={{
            transformOrigin: "50px 50px",
            transform: `rotate(${rotation}deg)`,
          }}
          className={cn(
            // "Back-out" cubic-bezier (overshoots past the target angle,
            // then settles back) instead of a flat ease-out — a wheel that
            // glides to an exact stop reads as CSS, one that slightly
            // overshoots and rocks back reads as a physical object with
            // momentum. Only applied on the final settle (landedIndex>=0);
            // the free-spin phase below is unaffected.
            "motion-safe:transition-transform motion-safe:duration-[1400ms] motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            spinning && landedIndex < 0 && "motion-safe:animate-spin",
          )}
        >
          {segments.map((segment, i) => {
            const startAngle = ((i * anglePerSegment - 90) * Math.PI) / 180;
            const endAngle = (((i + 1) * anglePerSegment - 90) * Math.PI) / 180;
            const x1 = 50 + 48 * Math.cos(startAngle);
            const y1 = 50 + 48 * Math.sin(startAngle);
            const x2 = 50 + 48 * Math.cos(endAngle);
            const y2 = 50 + 48 * Math.sin(endAngle);
            const largeArc = anglePerSegment > 180 ? 1 : 0;
            const midAngle = i * anglePerSegment + anglePerSegment / 2 - 90;
            const midRad = (midAngle * Math.PI) / 180;
            const tx = 50 + 30 * Math.cos(midRad);
            const ty = 50 + 30 * Math.sin(midRad);
            return (
              <g key={segment.id}>
                <path
                  d={`M50 50 L${x1} ${y1} A48 48 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  className={segment.reward ? "fill-gold/70" : "fill-muted"}
                  stroke="var(--background)"
                  strokeWidth="0.6"
                />
                <text
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${midAngle + 90} ${tx} ${ty})`}
                  className={cn(
                    "text-[6px] font-semibold",
                    segment.reward
                      ? "fill-gold-foreground"
                      : "fill-muted-foreground",
                  )}
                >
                  {segment.label}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx="50" cy="50" r="4" className="fill-primary" />
      </svg>
      <div className="absolute inset-x-0 -top-1 flex justify-center">
        <div className="size-0 border-x-8 border-t-8 border-x-transparent border-t-primary" />
      </div>
    </div>
  );
}
