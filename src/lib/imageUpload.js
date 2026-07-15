/**
 * Client helpers: resize phone photos, then upload to Supabase via /api/upload.
 */

/** Accept large camera photos; we shrink before upload. */
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * @param {File} file
 * @param {{ maxSide?: number, quality?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function compressImageFile(file, opts = {}) {
  const maxSide = opts.maxSide ?? 1024;
  const quality = opts.quality ?? 0.82;

  if (!file?.type?.startsWith("image/")) {
    throw new Error("Please select an image file");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("Image must be under 20MB");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to read image"));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Could not compress image"))),
        "image/jpeg",
        quality
      );
    });
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Compress and upload an image; returns a public Supabase Storage URL.
 * @param {File} file
 * @param {{ folder?: string, maxSide?: number, quality?: number }} [opts]
 */
export async function uploadImageToSupabase(file, opts = {}) {
  const blob = await compressImageFile(file, opts);
  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  if (opts.folder) form.append("folder", opts.folder);

  const res = await fetch("/api/upload", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to upload image");
  }
  return data.url;
}
