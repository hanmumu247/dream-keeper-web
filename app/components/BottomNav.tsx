"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { countDreams } from "../lib/dreamStorage";

export default function BottomNav() {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const update = async () => {
      const c = await countDreams();
      if (!cancelled) setCount(c);
    };
    update();
    // 路由切换时重拉一次；不再轮询（云端版没必要）
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const items = [
    {
      href: "/",
      label: "记梦",
      icon: "🌙",
      count: 0,
      // 月亮 → 金黄
      activeText: "text-[#E5C36A]",
      activeBar: "bg-[#E5C36A]",
      activeBg: "bg-[#E5C36A]/10",
    },
    {
      href: "/dreams",
      label: "牌组",
      icon: "📂",
      count,
      // 牌组 → 柔紫
      activeText: "text-[#B49DE8]",
      activeBar: "bg-[#B49DE8]",
      activeBg: "bg-[#B49DE8]/10",
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0F0F1A]/80 border-t border-[var(--border)]">
      <div className="max-w-2xl mx-auto flex justify-around items-stretch h-16 px-6">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-1 text-xs flex-1 transition-colors ${
                active
                  ? item.activeText
                  : "text-[var(--muted)] hover:text-[var(--foreground)]/80"
              }`}
            >
              {/* 顶部高亮条 */}
              {active && (
                <span
                  className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-10 rounded-full ${item.activeBar}`}
                />
              )}
              {/* 背景柔光 */}
              {active && (
                <span
                  className={`absolute inset-x-2 inset-y-2 -z-10 rounded-2xl ${item.activeBg}`}
                />
              )}
              <span
                className={`text-lg ${active ? "scale-110" : ""} transition-transform`}
              >
                {item.icon}
              </span>
              <span
                className={`font-serif tracking-wider ${
                  active ? "font-semibold" : ""
                }`}
              >
                {item.label}
                {item.count > 0 && ` (${item.count})`}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
