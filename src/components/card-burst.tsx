"use client";

import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const COLORS = [
  "bg-gold",
  "bg-primary",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-rose-500",
];

type Piece = {
  id: number;
  angle: number;
  distance: number;
  delay: number;
  duration: number;
  color: string;
};

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: Math.random() * 360,
    distance: 40 + Math.random() * 50,
    delay: Math.random() * 0.15,
    duration: 0.6 + Math.random() * 0.4,
    color: COLORS[i % COLORS.length],
  }));
}

// Fireworks-style burst contained to whatever relative-positioned box the
// caller wraps it in (unlike the deleted ConfettiBurst, which was
// `fixed inset-0` and covered the entire viewport regardless of where it
// was mounted). Particles radiate outward from the container's center.
export function CardBurst({ active }: { active: boolean }) {
  const pieces = useMemo(() => (active ? makePieces(24) : []), [active]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className={cn(
            "card-burst-piece absolute top-1/2 left-1/2 size-2 rounded-sm",
            p.color,
          )}
          style={
            {
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--burst-angle": `${p.angle}deg`,
              "--burst-distance": `${p.distance}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
