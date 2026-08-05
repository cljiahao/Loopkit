import { describe, it, expect, vi } from "vitest";

const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: () => ({ upload, getPublicUrl }),
    },
  }),
}));

import { uploadLoopkitImage } from "./image-upload-adapter";

describe("uploadLoopkitImage", () => {
  it("uploads to the given bucket/path and returns the public URL", async () => {
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.com/vendor-images/x.webp" },
    });

    const url = await uploadLoopkitImage({
      bucket: "vendor-images",
      path: "vendor-123/some-uuid.webp",
      blob: new Blob(["x"], { type: "image/webp" }),
      contentType: "image/webp",
    });

    expect(url).toBe("https://example.com/vendor-images/x.webp");
    expect(upload).toHaveBeenCalledWith(
      "vendor-123/some-uuid.webp",
      expect.any(Blob),
      { upsert: false, contentType: "image/webp" },
    );
  });

  it("throws when the storage upload fails", async () => {
    upload.mockResolvedValue({ error: new Error("upload failed") });

    await expect(
      uploadLoopkitImage({
        bucket: "vendor-images",
        path: "vendor-123/x.webp",
        blob: new Blob(["x"]),
        contentType: "image/webp",
      }),
    ).rejects.toThrow("upload failed");
  });
});
