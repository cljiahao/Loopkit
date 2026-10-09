"use client";

import { useRef } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "./use-async-action";
import type { ActionResult } from "@/lib/action-result";

export function useSaveSettings(
  action: (data: FormData) => Promise<ActionResult>,
) {
  const { pending, run } = useAsyncAction();
  const saving = useRef(false);
  function save(data: FormData) {
    if (saving.current) return;
    saving.current = true;
    void run(async () => {
      try {
        const result = await action(data);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        toast.success("Settings saved");
      } catch {
        toast.error("Could not save settings. Try again.");
      } finally {
        saving.current = false;
      }
    });
  }
  return { pending, save };
}
