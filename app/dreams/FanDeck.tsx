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

  /**
   * 根据总卡数自适应布局：
   *  - 1 张：纯居中，无旋转
   *  - 2-3 张：轻堆叠，像明信片叠一起
   *  - 4+ 张：完整扇形，明显铺开
   */
  function slotStyle(slot: number) {
    let rotateBase: number;
    let offsetXStep: number;
    let offsetYStep: number;
    let scaleStep: number;

    if (total === 1) {
      rotateBase = 0;
      offsetXStep = 0;
      offsetYStep = 0;
      scaleStep = 0;
    } else if (total === 2) {
      // 两张：错落开一点点像两张明信片
      rotateBase = 4;
      offsetXStep = 14;
      offsetYStep = 8;
      scaleStep = 0.025;
    } else if (total === 3) {
      // 三张：明显错落，已经有"一摞牌"的感觉
      rotateBase = 6;
      offsetXStep = 16;
      offsetYStep = 10;
      scaleStep = 0.03;
    } else {
      // 4+ 张：完整扇形
      rotateBase = 9;
      offsetXStep = 18;
      offsetYStep = 10;
      scaleStep = 0.03;
    }

    return {
      rotate: slot * rotateBase,
      x: slot * offsetXStep,
      y: slot * offsetYStep,
      scale: 1 - slot * scaleStep,
      zIndex: VISIBLE_CARDS - slot,
      opacity: slot === visibleSlots - 1 && slot > 0 && total > 3 ? 0.7 : 1,
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
