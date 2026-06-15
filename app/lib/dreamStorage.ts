/**
 * 梦境牌组 — 云端存储版（Supabase）
 *
 * 历史：V1 用 LocalStorage；V2 改成 Supabase，多设备同步、按用户隔离（RLS）。
 *
 * 注意：created_at 从 V1 的 number(ms) 改成了 string(ISO)，调用方需用 new Date(s) 解析。
 */

import { createClient } from "./supabase/client";

export type StoredScene = {
  index: number;
  description_zh: string;
  prompt_en: string;
  image_url: string | null;
};

export type StoredDream = {
  id: string;
  created_at: string; // ISO timestamp
  title: string;
  emotions: string[];
  mode: string;
  style_label: string;
  style_key: string;
  cover_index: number;
  scenes: StoredScene[];
  original_content: string;
  original_emotion: string;
  status: "sealed" | "shared";
};

// 数据库行 → 前端类型
type DbDream = {
  id: string;
  created_at: string;
  title: string;
  emotions: string[];
  mode: string;
  style_label: string;
  style_key: string;
  cover_index: number;
  scenes: StoredScene[];
  original_content: string;
  original_emotion: string;
  status: "sealed" | "shared";
};

function rowToDream(row: DbDream): StoredDream {
  return {
    id: row.id,
    created_at: row.created_at,
    title: row.title,
    emotions: row.emotions,
    mode: row.mode,
    style_label: row.style_label,
    style_key: row.style_key,
    cover_index: row.cover_index,
    scenes: row.scenes,
    original_content: row.original_content,
    original_emotion: row.original_emotion,
    status: row.status,
  };
}

export async function listDreams(): Promise<StoredDream[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dreams")
    .select(
      "id, created_at, title, emotions, mode, style_label, style_key, cover_index, scenes, original_content, original_emotion, status"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listDreams 失败：", error);
    return [];
  }
  return (data as DbDream[]).map(rowToDream);
}

export async function getDream(id: string): Promise<StoredDream | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dreams")
    .select(
      "id, created_at, title, emotions, mode, style_label, style_key, cover_index, scenes, original_content, original_emotion, status"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getDream 失败：", error);
    return null;
  }
  return data ? rowToDream(data as DbDream) : null;
}

export async function saveDream(
  dream: Omit<StoredDream, "id" | "created_at">
): Promise<StoredDream> {
  const supabase = createClient();

  // RLS 要求 user_id = auth.uid()，所以要从 session 拿 user.id 一起写入
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("未登录，无法保存梦");

  const { data, error } = await supabase
    .from("dreams")
    .insert({
      user_id: user.id,
      title: dream.title,
      emotions: dream.emotions,
      mode: dream.mode,
      style_label: dream.style_label,
      style_key: dream.style_key,
      cover_index: dream.cover_index,
      scenes: dream.scenes,
      original_content: dream.original_content,
      original_emotion: dream.original_emotion,
      status: dream.status,
    })
    .select(
      "id, created_at, title, emotions, mode, style_label, style_key, cover_index, scenes, original_content, original_emotion, status"
    )
    .single();

  if (error) {
    console.error("saveDream 失败：", error);
    throw error;
  }
  return rowToDream(data as DbDream);
}

export async function deleteDream(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("dreams").delete().eq("id", id);
  if (error) {
    console.error("deleteDream 失败：", error);
    throw error;
  }
}

export async function updateDreamStatus(
  id: string,
  status: "sealed" | "shared"
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("dreams")
    .update({ status })
    .eq("id", id);
  if (error) {
    console.error("updateDreamStatus 失败：", error);
    throw error;
  }
}

export async function countDreams(): Promise<number> {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("dreams")
    .select("*", { count: "exact", head: true });

  if (error) {
    // 未登录态会拿到 401 — 安静返回 0，不污染 console
    return 0;
  }
  return count ?? 0;
}
