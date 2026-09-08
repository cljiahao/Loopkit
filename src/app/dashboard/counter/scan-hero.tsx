"use client";

import { ScanButton, type ScanResolved } from "@/app/dashboard/scan-button";

// The Counter's primary action: a large cornered scan target. All decode and
// token-resolve logic stays in ScanButton (variant "hero"); this is the
// semantic wrapper the Counter mounts.
export function ScanHero({
  onResolved,
}: {
  onResolved: (result: ScanResolved) => void;
}) {
  return (
    <ScanButton
      variant="hero"
      label="Scan the customer's card"
      sublabel="Camera opens when you tap"
      onResolved={onResolved}
    />
  );
}
