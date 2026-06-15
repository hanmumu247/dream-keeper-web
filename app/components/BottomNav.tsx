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
    { href: "/", label: "记梦", icon: "🌙", count: 0 },
    { href: "/dreams", label: "牌组", icon: "📂", count },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0F0F1A]/80 border-t border-[var(--border)]">
      <div className="max-w-2xl mx-auto flex justify-around items-center h-16 px-6">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 text-xs transition-colors ${
                active ? "text-[var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-serif tracking-wider">
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
