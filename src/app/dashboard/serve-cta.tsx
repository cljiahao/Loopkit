"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { PlusCircle } from "lucide-react";

const LAST_USED_KEY = "loopkit:last-counter-program";

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

function readLastUsed(): string | null {
  try {
    return window.localStorage.getItem(LAST_USED_KEY);
  } catch {
    return null;
  }
}

// The "Serve a customer" button. Routes to the Counter for the last program
// the vendor served on this device (the Counter writes that key), falling back
// to the server-provided default. Reads only, never writes.
export function ServeCta({
  defaultProgramId,
  programIds,
}: {
  defaultProgramId: string;
  programIds: string[];
}) {
  const stored = useSyncExternalStore(subscribe, readLastUsed, () => null);
  const target =
    stored && programIds.includes(stored) ? stored : defaultProgramId;

  return (
    <Link
      href={`/dashboard/counter?p=${target}`}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm transition-[filter] hover:brightness-105"
    >
      <PlusCircle className="size-4" />
      Serve a customer
    </Link>
  );
}
