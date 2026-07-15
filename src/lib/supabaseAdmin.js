import { createClient } from "@supabase/supabase-js";

const url =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const secretKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

/** Server-only Supabase client (bypasses RLS). Never import in client components. */
export function getSupabaseAdmin() {
  if (!url || !secretKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SECRET_KEY — add them to .env.local and Vercel"
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const MEDIA_BUCKET = "media";

let bucketReady = false;

/** Ensure public `media` bucket exists (idempotent). */
export async function ensureMediaBucket() {
  if (bucketReady) return;
  const supabase = getSupabaseAdmin();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const exists = (buckets || []).some((b) => b.name === MEDIA_BUCKET);
  if (!exists) {
    const { error } = await supabase.storage.createBucket(MEDIA_BUCKET, {
      public: true,
      fileSizeLimit: 8 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    });
    if (error && !/already exists/i.test(error.message || "")) {
      throw error;
    }
  }
  bucketReady = true;
}

export function publicMediaUrl(path) {
  const supabase = getSupabaseAdmin();
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
