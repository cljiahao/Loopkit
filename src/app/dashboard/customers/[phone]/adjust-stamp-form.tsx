"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { adjustStampAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// A vendor's only fix for a stamp mistake used to be a full card reset.
// This is a targeted ± correction with a required reason, logged as its
// own activity-feed entry — never silently equivalent to a real stamp.
export function AdjustStampForm({
  programId,
  phone,
}: {
  programId: string;
  phone: string;
}) {
  const { pending, run } = useAsyncAction();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Adjust stamps
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        run(async () => {
          const result = await adjustStampAction(formData);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success(`Stamp count is now ${result.card.stamp_count}.`);
          setOpen(false);
          formRef.current?.reset();
        });
      }}
    >
      <input type="hidden" name="program_id" value={programId} />
      <input type="hidden" name="phone" value={phone} />
      <div className="flex flex-col gap-1">
        <Label htmlFor={`delta-${programId}`} className="text-xs">
          Delta
        </Label>
        <Input
          id={`delta-${programId}`}
          name="delta"
          type="number"
          step="1"
          placeholder="+1 or -1"
          required
          className="h-9 w-24"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label htmlFor={`reason-${programId}`} className="text-xs">
          Reason
        </Label>
        <Input
          id={`reason-${programId}`}
          name="reason"
          type="text"
          placeholder="Why is this correction needed?"
          required
          className="h-9"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Apply"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </form>
  );
}
