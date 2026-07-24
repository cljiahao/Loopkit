"use client";

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/utils";

const MAX_TILT_DEG = 6;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Shared outer shell for loopkit's customer-facing progress card — wraps
 * every card-type view (stamp/flame/points/plant/cup/wheel/scratch/lucky) in
 * both the `/setup` live preview (`PreviewCard`) and the real `/c` card
 * (`ProgramCardStatus`), so the "premium trading card" treatment (an idle
 * holographic sheen + a capped pointer-tracking 3D tilt) applies uniformly
 * across every card type via one shared change instead of eight. Purely
 * presentational — no card-type awareness, no engine/Supabase imports.
 *
 * Deliberately pure CSS transforms + a light pointer handler, not a 3D
 * rendering library (three.js) or an animation library (Framer Motion) —
 * see docs/superpowers/specs/2026-07-25-loyalty-card-animation-polish-design.md
 * for why: the tilt/shine visual language is fully achievable with
 * GPU-accelerated CSS `transform`/`conic-gradient`, and loopkit's customers
 * hit this on phone browsers at a shop counter, not a controlled demo.
 *
 * The tilt is skipped entirely (no pointer listeners engaged, just a static
 * shell) under `prefers-reduced-motion` — this is a continuous, always-on
 * pointer-driven effect, not a one-shot reveal, so it needs to never
 * activate rather than just play once instantly.
 */
export function CardShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [reducedMotion] = useState(prefersReducedMotion);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (reducedMotion || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      setTilt({
        x: (0.5 - py) * 2 * MAX_TILT_DEG,
        y: (px - 0.5) * 2 * MAX_TILT_DEG,
      });
    },
    [reducedMotion],
  );

  const handlePointerLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  return (
    <div
      ref={ref}
      data-testid="card-shell"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={
        reducedMotion
          ? undefined
          : {
              transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              transition: "transform 150ms ease-out",
              // Deliberately NOT transform-style: preserve-3d — combining
              // preserve-3d with overflow-hidden on the same element is a
              // documented rendering conflict (the 3D scene flattens/
              // distorts unpredictably the moment overflow needs clipping,
              // e.g. when CardBurst's celebration pieces are active), which
              // is what caused the card to visibly "expand" on a win.
              // Default `flat` paints children onto the tilted plane as a
              // single 2D surface instead, which is exactly what a "tilt a
              // flat card" effect should do anyway — no scene depth is
              // wanted here, just one tilted plane.
            }
      }
      className={cn(
        "card-shell relative space-y-4 overflow-hidden rounded-xl border bg-muted/40 p-4",
        className,
      )}
    >
      {!reducedMotion && (
        <div
          aria-hidden="true"
          data-testid="card-shell-sheen"
          className="card-shell-sheen pointer-events-none absolute inset-0 z-0"
        />
      )}
      <div className="relative z-[1] space-y-4">{children}</div>
    </div>
  );
}
