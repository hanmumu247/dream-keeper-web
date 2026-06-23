/**
 * 梦境牌组 — 云端存储版（Supabase）
 *
 * 历史：V1 用 LocalStorage；V2 改成 Supabase，多设备同步、按用户隔离（RLS）。
 *
 * 注意：created_at 从 V1 的 number(ms) 改成了 string(ISO)，调用方需用 new Date(s) 解析。
 */

import { createClient } from "./supabase/client";

/**
 * 把 ISO 时间格式化成"2026/6/23 14:35 的梦"作为梦的标题。
 * 不再用 LLM 生成的 title 字段，所有 UI 统一用这个。
 */
export function formatDreamTitle(createdAt: string): string {
  const d = new Date(createdAt);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm} 的梦`;
}

export type StoredScene = {
  index: number;
  description_zh: string;
  prompt_en: string;
  image_url: string | null;
};

export type Interpretation = {
  traditional: string;
  psychological: string;
  created_at: string;
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
  interpretation: Interpretation | null;
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
  interpretation: Interpretation | null;
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
    interpretation: row.interpretation,
  };
}

const FULL_SELECT =
  "id, created_at, title, emotions, mode, style_label, style_key, cover_index, scenes, original_content, original_emotion, status, interpretation";

export async function listDreams(): Promise<StoredDream[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("dreams")
    .select(
      FULL_SELECT
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
      FULL_SELECT
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
  dream: Omit<StoredDream, "id" | "created_at" | "interpretation">
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
      FULL_SELECT
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

/**
 * 调用 /api/interpret-dream 让 LLM 解一个梦，并存入数据库。
 * 如果该梦已经有 interpretation，默认直接返回缓存；传 force=true 强制重生成。
 */
export async function interpretDream(
  dreamId: string,
  force = false
): Promise<Interpretation> {
  const res = await fetch("/api/interpret-dream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dreamId, force }),
  });
  const data = await res.json();
  if (!res.ok || !data.interpretation) {
    throw new Error(data.error || "解梦失败");
  }
  return data.interpretation as Interpretation;
}
