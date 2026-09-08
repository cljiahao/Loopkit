"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { resolveTokenAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";

export type ScanResolved =
  | { kind: "card"; phone: string; programId: string }
  | {
      kind: "voucher";
      phone: string;
      voucherToken: string;
      rewardText: string;
    };

export function ScanButton({
  label = "Scan to serve",
  sublabel,
  variant = "button",
  onResolved,
}: {
  label?: string;
  /** Second line, hero variant only. */
  sublabel?: string;
  /** "button" — full-width primary trigger (default). "link" — small
   * secondary text trigger. "hero" — the large cornered scan target that is
   * the primary action on the Counter page. */
  variant?: "button" | "link" | "hero";
  onResolved: (result: ScanResolved) => void;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          async (result) => {
            if (!result || cancelled) return;
            cancelled = true;
            controls.stop();
            const fd = new FormData();
            fd.set("token", result.getText());
            const res = await resolveTokenAction(fd);
            if (res.success) {
              onResolved(res);
              setOpen(false);
            } else {
              toast.error(res.error);
              setOpen(false);
            }
          },
        );
        stop = () => controls.stop();
      } catch {
        toast.error("Couldn't open the camera. Check permissions.");
        setOpen(false);
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [open, onResolved]);

  return (
    <>
      {variant === "link" && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Camera className="size-3.5" />
          {label}
        </button>
      )}
      {variant === "button" && (
        <Button
          type="button"
          size="lg"
          onClick={() => setOpen(true)}
          className="h-14 w-full rounded-xl text-base font-semibold"
        >
          <Camera className="size-5" />
          {label}
        </Button>
      )}
      {variant === "hero" && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative flex min-h-52 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-8 text-center outline-none transition-colors hover:border-primary hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-64"
        >
          <span
            aria-hidden
            className="absolute inset-3 rounded-xl [background:linear-gradient(to_right,var(--primary)_2px,transparent_2px)_0_0/1.5rem_2px,linear-gradient(to_bottom,var(--primary)_2px,transparent_2px)_0_0/2px_1.5rem,linear-gradient(to_left,var(--primary)_2px,transparent_2px)_100%_100%/1.5rem_2px,linear-gradient(to_top,var(--primary)_2px,transparent_2px)_100%_100%/2px_1.5rem] bg-no-repeat opacity-50"
          />
          <ScanLine className="size-10 text-primary" />
          <span className="text-lg font-bold tracking-tight">{label}</span>
          {sublabel && (
            <span className="text-sm text-muted-foreground">{sublabel}</span>
          )}
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/90 p-5">
          <video
            ref={videoRef}
            className="w-full max-w-sm rounded-2xl"
            muted
            playsInline
          />
          <p className="text-sm text-white/80">
            Point at the customer&rsquo;s QR code
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setOpen(false)}
            className="rounded-xl"
          >
            <X className="size-4" /> Cancel
          </Button>
        </div>
      )}
    </>
  );
}
