"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const SUBMIT_CLASS = "h-12 w-full rounded-xl text-base font-semibold";

export function EditImpactDialog({
  impactLines,
  pending,
  label,
}: {
  impactLines: string[] | null;
  pending: boolean;
  label: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!impactLines || impactLines.length === 0) {
    return (
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className={SUBMIT_CLASS}
      >
        {label}
      </Button>
    );
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="lg"
        disabled={pending}
        className={SUBMIT_CLASS}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save this change?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {impactLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => triggerRef.current?.form?.requestSubmit()}
            >
              Save the change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
