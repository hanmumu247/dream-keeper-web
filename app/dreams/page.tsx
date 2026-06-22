"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDreams, deleteDream, interpretDream, StoredDream } from "../lib/dreamStorage";

export default function DreamsPage() {
  const [dreams, setDreams] = useState<StoredDream[]>([]);
  const [selected, setSelected] = useState<StoredDream | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDreams().then((d) => {
      if (cancelled) return;
      setDreams(d);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("删除这个梦？")) return;
    try {
      await deleteDream(id);
    } catch (err) {
      alert("删除失败：" + String(err));
      return;
    }
    setDreams(await listDreams());
    if (selected?.id === id) setSelected(null);
  }

  async function handleInterpret(dreamId: string) {
    if (interpreting) return;
    setInterpretError(null);
    setInterpreting(true);
    try {
      const result = await interpretDream(dreamId);
      // 把结果合并回当前 selected + 列表中的对应项，避免下次进来再调一次
      setSelected((d) => (d ? { ...d, interpretation: result } : d));
      setDreams((list) =>
        list.map((d) => (d.id === dreamId ? { ...d, interpretation: result } : d))
      );
    } catch (err) {
      setInterpretError(String(err instanceof Error ? err.message : err));
    } finally {
      setInterpreting(false);
    }
  }

  // 详情态
  if (selected) {
    const cover =
      selected.scenes.find((s) => s.index === selected.cover_index) ||
      selected.scenes[0];
    return (
      <div className="py-8 fade-in">
        <button
          onClick={() => {
            setSelected(null);
            setInterpretError(null);
          }}
          className="text-[var(--muted)] text-sm mb-6 hover:text-[var(--foreground)] transition-colors"
        >
          ← 返回牌组
        </button>

        <div className="bg-[var(--background-card)]/50 border border-[var(--border)] rounded-2xl p-4 mb-6">
          <h1 className="font-serif text-2xl tracking-wide mb-2">
            {selected.title}
          </h1>
          <p className="font-serif text-xs text-[var(--muted)]">
            {new Date(selected.created_at).toLocaleString("zh-CN")} ·{" "}
            {selected.emotions.join(" + ")} · {selected.style_label} ·{" "}
            {selected.status === "shared" ? "✅ 已分享" : "🔒 封存"}
          </p>
        </div>

        {/* 原文 */}
        <div className="bg-[var(--background-card)]/50 border border-[var(--border)] rounded-2xl p-5 mb-8">
          <p className="text-[var(--accent)] text-xs font-serif mb-2 tracking-wider">
            ✦ 梦境
          </p>
          <p className="font-serif text-sm leading-relaxed text-[var(--foreground)]/90 mb-4">
            {selected.original_content}
          </p>
          {selected.original_emotion && (
            <>
              <p className="text-[var(--accent)] text-xs font-serif mb-2 tracking-wider">
                ✦ 感受
              </p>
              <p className="font-serif text-sm leading-relaxed text-[var(--foreground)]/90">
                {selected.original_emotion}
              </p>
            </>
          )}
        </div>

        {/* 解梦区：已有→直接展示；没有→给按钮 */}
        <div className="mb-8">
          {selected.interpretation ? (
            <div className="bg-[var(--background-card)]/50 border border-[var(--border)] rounded-2xl p-5 fade-in">
              <div className="mb-4">
                <p className="text-[var(--accent)] text-xs font-serif mb-2 tracking-wider">
                  ✦ 梦语
                </p>
                <p className="font-serif text-sm leading-relaxed text-[var(--foreground)]/90">
                  {selected.interpretation.traditional}
                </p>
              </div>
              <div className="border-t border-[var(--border)] pt-4">
                <p className="text-[var(--accent)] text-xs font-serif mb-2 tracking-wider">
                  ✦ 心底
                </p>
                <p className="font-serif text-sm leading-relaxed text-[var(--foreground)]/90">
                  {selected.interpretation.psychological}
                </p>
              </div>
            </div>
          ) : interpreting ? (
            <div className="w-full py-3 rounded-2xl bg-[var(--background-card)] border border-[var(--border)] text-[var(--muted)] font-serif tracking-wider text-sm text-center">
              ✦ 正 在 解 读 你 的 梦 ⋯
            </div>
          ) : (
            <>
              <button
                onClick={() => handleInterpret(selected.id)}
                className="w-full py-3 rounded-2xl bg-[var(--background-card)] border border-[var(--accent)]/30 text-[var(--accent)] font-serif tracking-wider hover:bg-[var(--background-card)]/70 hover:border-[var(--accent)]/60 transition-all text-sm"
              >
                ✦ 解 一 下 这 个 梦
              </button>
              {interpretError && (
                <div className="mt-2 p-3 bg-red-900/30 border border-red-800/50 rounded-2xl text-xs font-serif text-red-300">
                  {interpretError}
                </div>
              )}
            </>
          )}
        </div>

        {/* 全部图集 */}
        <div className="space-y-6 mb-8">
          {selected.scenes.map((scene) => (
            <div key={scene.index}>
              {scene.image_url ? (
                <img
                  src={scene.image_url}
                  alt={`画面 ${scene.index}`}
                  className="w-full aspect-square rounded-2xl object-cover mb-3"
                />
              ) : (
                <div className="w-full aspect-square rounded-2xl bg-zinc-800 mb-3" />
              )}
              <p className="font-serif text-sm text-[var(--foreground)]/80 leading-relaxed px-1">
                <span className="text-[var(--accent)] mr-2">
                  画面 {scene.index}
                  {scene.index === selected.cover_index && " · 封面"}
                </span>
                {scene.description_zh}
              </p>
            </div>
          ))}
        </div>

        <button
          onClick={() => handleDelete(selected.id)}
          className="w-full py-3 rounded-full bg-red-900/30 border border-red-800/40 text-red-300 font-serif tracking-wider hover:bg-red-900/50 transition-all"
        >
          删除这个梦
        </button>
      </div>
    );
  }

  // 加载态（避免 SSR/客户端不一致）
  if (!loaded) {
    return <div className="min-h-[80vh]" />;
  }

  // 空牌组
  if (dreams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] fade-in text-center">
        <div className="text-5xl mb-6 opacity-50">📂</div>
        <h2 className="font-serif text-2xl tracking-wide mb-3">
          牌组还是空的
        </h2>
        <p className="font-serif text-[var(--muted)] text-sm mb-12 leading-relaxed max-w-xs">
          每一个被记下的梦，都会变成一张卡片留在这里。
        </p>

        <Link
          href="/"
          className="px-10 py-4 rounded-full bg-[var(--accent)]/90 hover:bg-[var(--accent)] text-[#1A1A2E] font-serif tracking-wider transition-all hover:scale-105"
        >
          记一个新梦
        </Link>
      </div>
    );
  }

  // 牌组列表
  return (
    <div className="py-8 fade-in">
      <h2 className="font-serif text-2xl tracking-wide mb-2">我的梦境牌组</h2>
      <p className="font-serif text-sm text-[var(--muted)] mb-8">
        共 {dreams.length} 个梦
      </p>

      <div className="grid grid-cols-2 gap-4">
        {dreams.map((d) => {
          const cover =
            d.scenes.find((s) => s.index === d.cover_index) || d.scenes[0];
          return (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              className="text-left bg-[var(--background-card)] border border-[var(--border)] rounded-2xl overflow-hidden hover:border-[var(--accent)]/40 transition-all group"
            >
              {cover?.image_url ? (
                <img
                  src={cover.image_url}
                  alt={d.title}
                  className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="w-full aspect-square bg-gradient-to-br from-zinc-700 to-zinc-950" />
              )}
              <div className="p-3">
                <h3 className="font-serif text-sm tracking-wide mb-1 truncate">
                  {d.title}
                </h3>
                <p className="font-serif text-[10px] text-[var(--muted)] truncate">
                  {new Date(d.created_at).toLocaleDateString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                  })}{" "}
                  · {d.emotions.join("+")} · {d.status === "shared" ? "✅" : "🔒"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
