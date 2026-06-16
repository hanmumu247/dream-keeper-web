"use client";

import { useState, useEffect } from "react";
import { saveDream, countDreams } from "./lib/dreamStorage";

type Stage = "welcome" | "input" | "loading" | "chat" | "settle";

const STYLES = [
  { id: "watercolor", label: "水彩" },
  { id: "lineart", label: "线稿" },
  { id: "cyber", label: "赛博" },
  { id: "oil", label: "油画" },
  { id: "storybook", label: "绘本" },
  { id: "auto", label: "AI 推荐" },
];

// 给小白看的画风一句话说明
const STYLE_DESCRIPTIONS: Record<string, string> = {
  watercolor: "水彩晕染，半透明色块叠在纸纹上 — 柔软、梦幻、情绪化。",
  lineart: "黑白线稿，大量留白和剪影 — 简练、克制、像清晨的草图。",
  cyber: "赛博霓虹，高饱和荧光色与故障感 — 未来、迷幻、不真实。",
  oil: "古典油画，厚涂笔触和强烈明暗 — 庄重、有戏剧感、19 世纪浪漫主义。",
  storybook: "绘本插画，扁平形状和柔和色彩 — 童趣、温暖、有故事感。",
};

type Scene = {
  index: number;
  description_zh: string;
  prompt_en: string;
  image_url: string | null;
  error?: string | null;
};

type DreamResult = {
  title: string;
  emotions: string[];
  mode: string;
  style_label: string;
  style_key?: string;
  cover_index: number;
  scenes: Scene[];
  stats?: { total: number; succeeded: number; failed: number };
  // 原始用户输入 — 用于沉淀卡牌展示
  original_content?: string;
  original_emotion?: string;
};

type RevisionMessage = {
  role: "ai" | "user";
  text: string;
};

export default function Home() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [content, setContent] = useState("");
  const [emotion, setEmotion] = useState("");
  const [style, setStyle] = useState("watercolor");
  const [chatInput, setChatInput] = useState("");
  const [dream, setDream] = useState<DreamResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [revisionLog, setRevisionLog] = useState<RevisionMessage[]>([]);
  const [dreamCount, setDreamCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    countDreams().then((c) => {
      if (!cancelled) setDreamCount(c);
    });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  // ============== 触发生成 ==============
  async function handleGenerate() {
    setStage("loading");
    setError(null);
    setRevisionLog([]);
    try {
      const res = await fetch("/api/generate-dream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, emotion, style }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.detail || "生成失败");
        setStage("input");
        return;
      }
      setDream({ ...data, style_key: style });
      setStage("chat");
    } catch (err) {
      setError(String(err));
      setStage("input");
    }
  }

  // ============== 触发修订 ==============
  async function handleRevise() {
    if (!dream || !chatInput.trim() || revising) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setRevising(true);
    setRevisionLog((log) => [...log, { role: "user", text: userMsg }]);

    try {
      const res = await fetch("/api/revise-dream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 剥掉 image_url（可能是 base64 大字符串），server 端不需要图本身，
          // 只需要 prompt_en + index + 中文描述来理解修改意图。
          scenes: dream.scenes.map((s) => ({
            index: s.index,
            description_zh: s.description_zh,
            prompt_en: s.prompt_en,
          })),
          userRequest: userMsg,
          currentStyleKey: dream.style_key || style,
          currentStyleLabel: dream.style_label,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRevisionLog((log) => [
          ...log,
          { role: "ai", text: `❌ 出错了：${data.error || "未知"}` },
        ]);
      } else {
        // 把没改过的 scene 的旧 image_url 合并回来（server 不持有图，只发回了占位）
        const oldByIndex = new Map(dream.scenes.map((s) => [s.index, s]));
        const mergedScenes: Scene[] = (data.scenes as Scene[]).map((s) => {
          if (s.image_url) return s; // server 改过，已上传新图
          const old = oldByIndex.get(s.index);
          // 旧 scene 的图（如果旧 prompt_en 一致则保留旧图；否则说明 server 漏返回了）
          if (old && old.prompt_en === s.prompt_en && old.image_url) {
            return { ...s, image_url: old.image_url };
          }
          return s;
        });
        setDream((d) =>
          d
            ? {
                ...d,
                scenes: mergedScenes,
                style_key: data.style_key,
                style_label: data.style_label,
              }
            : d
        );
        setRevisionLog((log) => [...log, { role: "ai", text: data.summary }]);
      }
    } catch (err) {
      setRevisionLog((log) => [
        ...log,
        { role: "ai", text: `❌ 网络错误：${String(err)}` },
      ]);
    } finally {
      setRevising(false);
    }
  }

  // ============== 欢迎态 ==============
  if (stage === "welcome") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] fade-in">
        <div className="text-6xl mb-6">🌙</div>
        <h1 className="font-serif text-3xl tracking-wide mb-2">
          Dream Keeper
        </h1>
        <p className="font-serif text-[var(--muted)] text-sm tracking-widest mb-16">
          梦 里 的 记 忆
        </p>

        <button
          onClick={() => {
            setError(null);
            setStage("input");
          }}
          className="px-12 py-4 rounded-full bg-[var(--accent)]/90 hover:bg-[var(--accent)] text-[#1A1A2E] font-serif text-lg tracking-wider transition-all hover:scale-105 shadow-lg shadow-[var(--accent)]/20"
        >
          记一个新梦
        </button>

        {dreamCount > 0 && (
          <p className="mt-8 text-[var(--muted)] text-sm">
            你的牌组里有 {dreamCount} 个梦
          </p>
        )}
      </div>
    );
  }

  // ============== 输入态 ==============
  if (stage === "input") {
    return (
      <div className="py-12 fade-in">
        <button
          onClick={() => setStage("welcome")}
          className="text-[var(--muted)] text-sm mb-8 hover:text-[var(--foreground)] transition-colors"
        >
          ← 返回
        </button>

        <h2 className="font-serif text-2xl mb-12 tracking-wide">
          讲讲你做的梦吧
        </h2>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-800/50 rounded-2xl text-sm font-mono break-all">
            ❌ {error}
          </div>
        )}

        <div className="mb-8">
          <label className="block font-serif text-[var(--accent)] text-sm mb-3 tracking-wider">
            ✦ 你梦到了什么？
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="尽可能完整地写下来，碎片也行..."
            className="w-full bg-[var(--background-card)] border border-[var(--border)] rounded-2xl px-5 py-4 text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--accent)]/50 font-serif leading-relaxed resize-none transition-colors"
          />
        </div>

        <div className="mb-8">
          <label className="block font-serif text-[var(--accent)] text-sm mb-3 tracking-wider">
            ✦ 梦里你的感受？
          </label>
          <textarea
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            rows={2}
            placeholder="不用归类，怎么说都行——比如：很慌但又有点期待"
            className="w-full bg-[var(--background-card)] border border-[var(--border)] rounded-2xl px-5 py-4 text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--accent)]/50 font-serif leading-relaxed resize-none transition-colors"
          />
        </div>

        <div className="mb-12">
          <label className="block font-serif text-[var(--accent)] text-sm mb-3 tracking-wider">
            ✦ 想要的画风？
          </label>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                className={`px-4 py-2 rounded-full text-sm font-serif tracking-wider transition-all ${
                  style === s.id
                    ? "bg-[var(--accent)]/90 text-[#1A1A2E]"
                    : "bg-[var(--background-card)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 风格预览：选了非 auto 时显示，给小白看效果 */}
          {style !== "auto" && STYLE_DESCRIPTIONS[style] && (
            <div className="mt-4 fade-in">
              <div className="bg-[var(--background-card)]/50 border border-[var(--border)] rounded-2xl overflow-hidden flex items-center gap-3 p-3">
                <img
                  key={style}
                  src={`/styles/A/${style}.jpg`}
                  alt={`${STYLES.find((s) => s.id === style)?.label} 示例`}
                  loading="eager"
                  className="w-24 h-24 rounded-xl object-cover shrink-0"
                />
                <p className="font-serif text-xs text-[var(--foreground)]/80 leading-relaxed flex-1">
                  {STYLE_DESCRIPTIONS[style]}
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => content.trim() && handleGenerate()}
          disabled={!content.trim()}
          className="w-full py-4 rounded-full bg-[var(--accent)]/90 hover:bg-[var(--accent)] text-[#1A1A2E] font-serif text-lg tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          开 始 作 画 →
        </button>
      </div>
    );
  }

  // ============== Loading 态 ==============
  if (stage === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] fade-in text-center">
        <div className="text-5xl mb-6 shimmer">🎨</div>
        <h2 className="font-serif text-2xl tracking-wide mb-3">
          AI 正在为你作画
        </h2>
        <p className="font-serif text-[var(--muted)] text-sm leading-relaxed max-w-xs mb-8">
          先在画布上勾轮廓，再一笔一笔上色。
          <br />
          通常需要 30-90 秒。
        </p>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  // ============== 对话态（真图） ==============
  if (stage === "chat" && dream) {
    return (
      <div className="py-8 fade-in">
        <button
          onClick={() => setStage("input")}
          className="text-[var(--muted)] text-sm mb-6 hover:text-[var(--foreground)] transition-colors"
        >
          ← 返回修改
        </button>

        {/* 元信息 */}
        <div className="bg-[var(--background-card)]/50 border border-[var(--border)] rounded-2xl p-4 mb-8">
          <h3 className="font-serif text-lg mb-2">{dream.title}</h3>
          <p className="font-serif text-xs text-[var(--muted)]">
            {dream.emotions.join(" + ")} · {dream.style_label} ·{" "}
            {dream.scenes.length} 张
          </p>
        </div>

        {/* 真图集 */}
        <div className="space-y-6 mb-8">
          {dream.scenes.map((scene) => (
            <div key={scene.index} className="fade-in">
              {scene.image_url ? (
                <img
                  src={scene.image_url}
                  alt={`画面 ${scene.index}`}
                  className="w-full aspect-square rounded-2xl object-cover mb-3"
                />
              ) : (
                <div className="w-full aspect-square rounded-2xl bg-red-900/20 border border-red-800/30 mb-3 flex items-center justify-center">
                  <p className="text-red-400 text-sm font-mono px-4 text-center">
                    ❌ 出图失败：{scene.error?.slice(0, 100) || "未知错误"}
                  </p>
                </div>
              )}
              <p className="font-serif text-sm text-[var(--foreground)]/80 leading-relaxed px-1">
                <span className="text-[var(--accent)] mr-2">
                  画面 {scene.index}
                  {scene.index === dream.cover_index && " · 封面"}
                </span>
                {scene.description_zh}
              </p>
            </div>
          ))}
        </div>

        {/* 修订对话 */}
        <div className="bg-[var(--background-card)]/50 border border-[var(--border)] rounded-2xl p-4 mb-4 space-y-3">
          <p className="font-serif text-sm text-[var(--foreground)]/80">
            {revisionLog.length === 0
              ? "这是初版。你想改哪里？说出来我帮你改。例如：「第 2 张更暗一点」、「整体改成线稿风」、「再加一张，海中央有一艘船」。"
              : "继续告诉我要改的地方，或点定稿。"}
          </p>
          {revisionLog.map((msg, i) => (
            <div
              key={i}
              className={`text-sm font-serif leading-relaxed ${
                msg.role === "user"
                  ? "text-[var(--accent)]"
                  : "text-[var(--foreground)]/80"
              }`}
            >
              {msg.role === "user" ? "你：" : "✨ "}
              {msg.text}
            </div>
          ))}
          {revising && (
            <div className="text-sm font-serif text-[var(--muted)]">
              ✨ 修改中...（约 30 秒）
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !revising) handleRevise();
            }}
            placeholder={revising ? "修改中..." : "想改的地方..."}
            className="flex-1 bg-[var(--background-card)] border border-[var(--border)] rounded-full px-5 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--accent)]/50 font-serif transition-colors disabled:opacity-50"
            disabled={revising}
          />
          <button
            onClick={handleRevise}
            disabled={revising || !chatInput.trim()}
            className="px-5 py-3 rounded-full bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] hover:text-[var(--accent)] disabled:opacity-30 transition-colors"
          >
            发送
          </button>
        </div>

        <button
          onClick={() => setStage("settle")}
          className="w-full py-4 rounded-full bg-[var(--accent)]/90 hover:bg-[var(--accent)] text-[#1A1A2E] font-serif text-lg tracking-wider transition-all"
        >
          ✓ 就 是 这 样 ， 定 稿
        </button>
      </div>
    );
  }

  // ============== 沉淀态 ==============
  if (stage === "settle" && dream) {
    const cover = dream.scenes.find((s) => s.index === dream.cover_index) || dream.scenes[0];

    const persistAndReturn = async (status: "sealed" | "shared") => {
      try {
        await saveDream({
          title: dream.title,
          emotions: dream.emotions,
          mode: dream.mode,
          style_label: dream.style_label,
          style_key: dream.style_key || style,
          cover_index: dream.cover_index,
          scenes: dream.scenes.map((s) => ({
            index: s.index,
            description_zh: s.description_zh,
            prompt_en: s.prompt_en,
            image_url: s.image_url,
          })),
          original_content: dream.original_content || content,
          original_emotion: dream.original_emotion || emotion,
          status,
        });
      } catch (err) {
        console.error("保存梦境失败：", err);
        alert("保存失败：" + String(err));
        return;
      }
      // 重置
      setStage("welcome");
      setContent("");
      setEmotion("");
      setDream(null);
      setRevisionLog([]);
    };

    return (
      <div className="py-12 fade-in flex flex-col items-center text-center">
        <div className="text-5xl mb-6">✨</div>
        <h2 className="font-serif text-2xl tracking-wide mb-2">
          已经为你收藏起来了
        </h2>
        <p className="text-[var(--muted)] text-sm mb-12 font-serif">
          这是你的第 {dreamCount + 1} 个梦
        </p>

        <div className="w-full bg-[var(--background-card)] border border-[var(--border)] rounded-3xl p-6 mb-12 text-left">
          {cover?.image_url ? (
            <img
              src={cover.image_url}
              alt={dream.title}
              className="w-full aspect-square rounded-2xl object-cover mb-4"
            />
          ) : (
            <div className="w-full aspect-square rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-950 mb-4" />
          )}
          <h3 className="font-serif text-xl mb-2 text-center">{dream.title}</h3>
          <p className="text-[var(--muted)] text-xs font-serif text-center mb-4">
            {dream.emotions.join(" + ")} · {dream.style_label}
          </p>

          {dream.original_content && (
            <div className="border-t border-[var(--border)] pt-4 mb-3">
              <p className="text-[var(--accent)] text-xs font-serif mb-2 tracking-wider">
                ✦ 梦境
              </p>
              <p className="font-serif text-sm leading-relaxed text-[var(--foreground)]/90">
                {dream.original_content}
              </p>
            </div>
          )}

          {dream.original_emotion && (
            <div className="border-t border-[var(--border)] pt-4">
              <p className="text-[var(--accent)] text-xs font-serif mb-2 tracking-wider">
                ✦ 感受
              </p>
              <p className="font-serif text-sm leading-relaxed text-[var(--foreground)]/90">
                {dream.original_emotion}
              </p>
            </div>
          )}
        </div>

        <p className="font-serif text-[var(--muted)] mb-8">
          要怎么处置这个梦？
        </p>

        <div className="w-full flex flex-col gap-3">
          <button
            onClick={() => persistAndReturn("shared")}
            className="w-full py-4 rounded-full bg-[var(--accent)]/90 hover:bg-[var(--accent)] text-[#1A1A2E] font-serif tracking-wider transition-all"
          >
            ✅ 分 享
          </button>
          <button
            onClick={() => persistAndReturn("sealed")}
            className="w-full py-4 rounded-full bg-[var(--background-card)] border border-[var(--border)] text-[var(--foreground)] font-serif tracking-wider hover:bg-[var(--background-card)]/70 transition-all"
          >
            🔒 封 存
          </button>
        </div>
      </div>
    );
  }

  return null;
}
