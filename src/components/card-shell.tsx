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

/** Pointer-driven card tilt is disabled for reduced motion. */
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
              // Keep the plane flat: preserve-3d conflicts with overflow clipping.
            }
      }
      className={cn(
        "card-shell relative space-y-4 overflow-hidden rounded-xl border bg-muted/40 p-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
