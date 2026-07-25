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
  size: number;
  shape: "square" | "circle";
};

const PIECE_COUNT = 40;

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: Math.random() * 360,
    // Wider spread than before (was 40-90px) — with more/bigger pieces the
    // burst needs more room to breathe, otherwise it reads as a dense blob
    // instead of a fireworks-style radiate-outward burst.
    distance: 50 + Math.random() * 80,
    delay: Math.random() * 0.15,
    duration: 0.7 + Math.random() * 0.5,
    color: COLORS[i % COLORS.length],
    // Randomized size (was a fixed size-2/8px) and a mix of square/circle
    // pieces for a punchier, less uniform "more confetti" look.
    size: 6 + Math.random() * 8,
    shape: Math.random() > 0.5 ? "circle" : "square",
  }));
}

// Fireworks-style burst contained to whatever relative-positioned box the
// caller wraps it in (unlike the deleted ConfettiBurst, which was
// `fixed inset-0` and covered the entire viewport regardless of where it
// was mounted). Particles radiate outward from the container's center.
export function CardBurst({ active }: { active: boolean }) {
  const pieces = useMemo(
    () => (active ? makePieces(PIECE_COUNT) : []),
    [active],
  );

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
            "card-burst-piece absolute top-1/2 left-1/2",
            p.shape === "circle" ? "rounded-full" : "rounded-sm",
            p.color,
          )}
          style={
            {
              width: `${p.size}px`,
              height: `${p.size}px`,
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
