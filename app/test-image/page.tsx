"use client";

import { useState } from "react";

export default function TestImagePage() {
  const [prompt, setPrompt] = useState(
    "Black and white line art, dreamlike, a small village with broken houses at dusk, small silhouettes of people running, heavy negative space, expressive lines"
  );
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<any>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setImages([]);
    setUsage(null);
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          quality: "medium",
          size: "1024x1024",
          n: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "请求失败");
        if (data.detail) setError((e) => `${e} | ${data.detail}`);
      } else {
        setImages(data.images || []);
        setUsage(data.usage || null);
      }
    } catch (err: any) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="py-8 fade-in">
      <h1 className="font-serif text-2xl tracking-wide mb-2">
        🧪 图像 API 测试
      </h1>
      <p className="text-[var(--muted)] text-sm mb-8 font-serif">
        验证后端调用 gpt-image-1 是否成功
      </p>

      <label className="block font-serif text-[var(--accent)] text-sm mb-3 tracking-wider">
        ✦ Prompt
      </label>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        className="w-full bg-[var(--background-card)] border border-[var(--border)] rounded-2xl px-5 py-4 text-[var(--foreground)] focus:outline-none focus:border-[var(--accent)]/50 font-serif leading-relaxed resize-none transition-colors mb-4"
      />

      <button
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
        className="w-full py-4 rounded-full bg-[var(--accent)]/90 hover:bg-[var(--accent)] text-[#1A1A2E] font-serif tracking-wider transition-all disabled:opacity-30"
      >
        {loading ? "✨ 作画中（5-15 秒）..." : "生成一张图"}
      </button>

      {error && (
        <div className="mt-6 p-4 bg-red-900/30 border border-red-800/50 rounded-2xl text-sm font-mono break-all">
          ❌ {error}
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-8 space-y-4">
          {images.map((src, i) => (
            <div key={i} className="fade-in">
              <img
                src={src}
                alt={`生成图 ${i + 1}`}
                className="w-full rounded-2xl"
              />
            </div>
          ))}
          {usage && (
            <div className="text-xs text-[var(--muted)] font-mono mt-2">
              tokens: input {usage.input_tokens} / output {usage.output_tokens}{" "}
              / total {usage.total_tokens}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
