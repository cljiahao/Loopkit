"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, X } from "lucide-react";
import { resolveTokenAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";

export function ScanButton({
  label = "Scan to serve",
  onResolved,
}: {
  label?: string;
  onResolved: (result: { phone: string; programId: string }) => void;
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
              onResolved({ phone: res.phone, programId: res.programId });
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
      <Button
        type="button"
        size="lg"
        onClick={() => setOpen(true)}
        className="h-14 w-full rounded-xl text-base font-semibold"
      >
        <Camera className="size-5" />
        {label}
      </Button>
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
