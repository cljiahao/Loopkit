"use client";

import { useEffect } from "react";

// Records the program the vendor last worked the Counter in, per device.
// Sub-plan 3's "Serve a customer" CTA reads this key to route back here.
export function RememberProgram({ id }: { id: string }) {
  useEffect(() => {
    try {
      localStorage.setItem("loopkit:last-counter-program", id);
    } catch {
      // Private mode or blocked storage: routing just falls back to the default.
    }
  }, [id]);
  return null;
}
