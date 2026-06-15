/**
 * 把图片二进制上传到 Supabase Storage，返回公开 URL。
 *
 * 用 service_role key（即 SUPABASE_SECRET_KEY），绕过 RLS 直接写。
 * 仅在 server 端使用。
 */

import { createClient } from "@supabase/supabase-js";

const BUCKET = "dream-images";

let cached: ReturnType<typeof createClient> | null = null;

function getAdminClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in env"
    );
  }
  cached = createClient(url, secret, {
    auth: { persistSession: false },
  });
  return cached;
}

/**
 * 把 base64 JPEG 字符串（不带 data: 前缀）上传到 Storage，返回公开 URL。
 * 路径：{userId}/{随机uuid}.jpg
 */
export async function uploadBase64Jpeg(
  userId: string,
  b64: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const buffer = Buffer.from(b64, "base64");
    const path = `${userId}/${crypto.randomUUID()}.jpg`;

    const { error } = await getAdminClient()
      .storage.from(BUCKET)
      .upload(path, buffer, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (error) {
      return { url: null, error: error.message };
    }

    const { data } = getAdminClient().storage.from(BUCKET).getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return { url: null, error: String(err) };
  }
}
