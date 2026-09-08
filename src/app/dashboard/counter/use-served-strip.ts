"use client";

import { useCallback, useRef, useState } from "react";
import type { ServedEntry } from "@/app/dashboard/counter/served-strip";

const CAP = 5;

// Owns the "Served just now" list so serve-customer.tsx does not nest this
// state plumbing inside its own handlers. push() prepends and, per the
// single-level-undo rule, clears every prior entry's Undo.
export function useServedStrip() {
  const seq = useRef(0);
  const [served, setServed] = useState<ServedEntry[]>([]);

  const push = useCallback((phone: string, note: string, undoable: boolean) => {
    seq.current += 1;
    const entry: ServedEntry = {
      id: String(seq.current),
      phone,
      note,
      undoable,
    };
    setServed((prev) => [entry, ...prev.map(clearUndo)].slice(0, CAP));
  }, []);

  const markDone = useCallback((id: string) => {
    setServed((prev) => prev.map((e) => (e.id === id ? clearUndo(e) : e)));
  }, []);

  return { served, push, markDone };
}

function clearUndo(entry: ServedEntry): ServedEntry {
  return entry.undoable ? { ...entry, undoable: false } : entry;
}
