import { NextResponse } from "next/server";
import {
  ensureMediaBucket,
  getSupabaseAdmin,
  MEDIA_BUCKET,
  publicMediaUrl,
} from "@/lib/supabaseAdmin";
import { requireAuth } from "@/lib/accessControl";

export const runtime = "nodejs";

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(request) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const folderRaw = String(form.get("folder") || "uploads").trim();
    const folder = folderRaw.replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "") || "uploads";

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const type = file.type || "application/octet-stream";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: "Image must be under 8MB after compression" },
        { status: 400 }
      );
    }

    await ensureMediaBucket();

    const ext =
      type === "image/png"
        ? "png"
        : type === "image/webp"
          ? "webp"
          : type === "image/gif"
            ? "gif"
            : "jpg";
    const path = `${folder}/${randomId()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, buffer, {
      contentType: type,
      upsert: false,
      cacheControl: "31536000",
    });

    if (error) {
      console.error("Supabase storage upload failed:", error);
      return NextResponse.json(
        { error: error.message || "Failed to upload to Supabase Storage" },
        { status: 500 }
      );
    }

    const url = publicMediaUrl(path);
    return NextResponse.json({ url, path, bucket: MEDIA_BUCKET });
  } catch (error) {
    console.error("Upload route error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload image" },
      { status: 500 }
    );
  }
}
