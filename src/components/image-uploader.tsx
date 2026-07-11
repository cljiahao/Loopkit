"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { resizeToWebp } from "@/lib/image-resize";

// SVG is intentionally excluded — seed art is referenced by path, not uploaded.
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
// Generous source cap — we resize + re-encode to WebP before upload, so big
// phone photos are fine; this only blocks absurd files.
// 15 MB
const MAX_BYTES = 15 * 1024 * 1024;
// Longest-side target: small square photo (thumb only — loopkit has no
// banner use case).
const MAX_DIM = 1000;

interface Props {
  bucket: string;
  pathPrefix: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

export function ImageUploader({ bucket, pathPrefix, value, onChange }: Props) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Use a JPEG, PNG, or WebP image");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image must be 15 MB or smaller");
      return;
    }

    setUploading(true);
    // Resize + WebP-encode in the browser so storage and load stay fast.
    const { blob, ext, type } = await resizeToWebp(file, MAX_DIM);
    const path = `${pathPrefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { upsert: false, contentType: type });

    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);
    onChange(publicUrl);
    setUploading(false);
  }

  if (value) {
    return (
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border">
        <Image src={value} alt="" fill sizes="5rem" className="object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur hover:bg-background"
          aria-label="Remove image"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      className="flex size-20 shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-60"
    >
      {uploading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <ImagePlus className="size-4" />
      )}
      <span className="text-[10px] font-medium leading-tight">
        {uploading ? "…" : "Add photo"}
      </span>
      {!uploading && (
        <span className="text-[9px] leading-tight text-muted-foreground/80">
          JPG · PNG · WebP
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </button>
  );
}
