-- Harden the vendor-images bucket, the same treatment qkit's booth-images got
-- in its 0037 and stockkit's vendor-avatars had from creation. It was created
-- public-read with no size or MIME constraint, so the browser-side resize in
-- ImageUploader was the only guard: a direct storage call with a vendor JWT
-- could upload an arbitrarily large file, or a non-image such as an HTML
-- payload that this public bucket would then serve. Enforce the limits at the
-- bucket so they hold regardless of client. 5 MB and JPEG/PNG/WebP match the
-- sibling kits' image buckets; the uploader re-encodes to WebP well under it.
update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'vendor-images';
