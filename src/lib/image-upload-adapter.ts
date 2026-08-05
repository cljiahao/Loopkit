import { createClient } from "@/lib/supabase/client";
import type { ImageUploaderProps } from "@merqo/ui";

// Plain function, not a factory — @merqo/ui's ImageUploader builds `path`
// internally from `pathPrefix` before ever calling onUpload, so there's
// nothing vendor-scoped left to bind at creation time.
export const uploadLoopkitImage: ImageUploaderProps["onUpload"] = async ({
  bucket,
  path,
  blob,
  contentType,
}) => {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { upsert: false, contentType });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
};
