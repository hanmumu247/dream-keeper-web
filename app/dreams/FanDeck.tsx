"use client";

import { motion, useMotionValue, animate } from "framer-motion";
import { useState } from "react";
import { formatDreamTitle, type StoredDream } from "../lib/dreamStorage";

/**
 * 扇形堆叠卡组：所有梦呈扇面铺开，前几张露出大部分，后面只露边角。
 * 拖拽扇面（左右滑）切换当前最上层那张。点击任意可见卡片进详情。
 */

type Props = {
  dreams: StoredDream[];
  onSelect: (dream: StoredDream) => void;
};

const VISIBLE_CARDS = 7; // 同时显示几张
const SWIPE_THRESHOLD = 80; // 拖拽多远算翻一张

export default function FanDeck({ dreams, onSelect }: Props) {
  // 当前最上层那张的 index（dreams 数组里）
  const [topIndex, setTopIndex] = useState(0);
  const dragX = useMotionValue(0);

  // 顺序：dreams 已是时间倒序（最新在前）。topIndex 指最前面这张。
  const total = dreams.length;
  if (total === 0) return null;

  const visibleSlots = Math.min(VISIBLE_CARDS, total);

  // 计算每张卡片的扇形位置参数
  // slot 0 是最前；slot 越大越偏后、越偏右下、旋转越大
  function slotStyle(slot: number) {
    const rotateBase = 4;
    const offsetX = slot * 12;
    const offsetY = slot * 6;
    return {
      rotate: slot * rotateBase,
      x: offsetX,
      y: offsetY,
      scale: 1 - slot * 0.025,
      zIndex: VISIBLE_CARDS - slot,
      opacity: slot === visibleSlots - 1 && slot > 0 ? 0.7 : 1,
    };
  }

  function handleDragEnd(_e: unknown, info: { offset: { x: number } }) {
    const offset = info.offset.x;
    if (offset < -SWIPE_THRESHOLD) {
      // 往左拖：露出下一张
      setTopIndex((i) => (i + 1) % total);
    } else if (offset > SWIPE_THRESHOLD) {
      // 往右拖：回到上一张
      setTopIndex((i) => (i - 1 + total) % total);
    }
    animate(dragX, 0, { type: "spring", stiffness: 300, damping: 30 });
  }

  return (
    <div className="relative w-full" style={{ minHeight: 480 }}>
      <div className="relative w-full flex justify-center items-start pt-4">
        <div className="relative" style={{ width: 240, height: 360 }}>
          {Array.from({ length: visibleSlots }).map((_, slot) => {
            const idx = (topIndex + slot) % total;
            const d = dreams[idx];
            const cover =
              d.scenes.find((s) => s.index === d.cover_index) || d.scenes[0];
            const style = slotStyle(slot);
            const isTop = slot === 0;

            return (
              <motion.div
                key={d.id}
                className="absolute inset-0 cursor-pointer select-none"
                style={{ zIndex: style.zIndex, x: isTop ? dragX : undefined }}
                animate={{
                  rotate: style.rotate,
                  x: isTop ? 0 : style.x,
                  y: style.y,
                  scale: style.scale,
                  opacity: style.opacity,
                }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
                drag={isTop ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.5}
                onDragEnd={isTop ? handleDragEnd : undefined}
                onClick={() => {
                  if (Math.abs(dragX.get()) < 5) onSelect(d);
                }}
              >
                <div className="w-full h-full bg-[var(--background-card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl shadow-black/40">
                  {cover?.image_url ? (
                    <img
                      src={cover.image_url}
                      alt=""
                      className="w-full h-3/4 object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-3/4 bg-gradient-to-br from-zinc-700 to-zinc-950" />
                  )}
                  <div className="p-3 h-1/4 flex flex-col justify-center">
                    <h3 className="font-serif text-xs tracking-wide truncate">
                      {formatDreamTitle(d.created_at)}
                    </h3>
                    <p className="font-serif text-[10px] text-[var(--muted)] truncate mt-1">
                      {d.emotions.join("+")} · {d.style_label}{" "}
                      {d.status === "shared" ? "✅" : "🔒"}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[var(--muted)] text-xs font-serif mt-8 tracking-wider">
        {total > 1 ? "← 左右拖动翻看 →" : "你的第一个梦"}
      </p>
    </div>
  );
}
