import { createClient } from "../lib/supabase/server";

/**
 * 右上角用户菜单：未登录时不渲染（登录页不会看到）。
 * 登录态显示邮箱前缀 + 登出按钮（form 提交到 /auth/signout）。
 */
export default async function UserMenu() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  // 只显示 @ 前面那截，太长再截断
  const handle = user.email.split("@")[0].slice(0, 14);

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-[var(--background-card)]/80 backdrop-blur-md border border-[var(--border)] pl-4 pr-2 py-1.5">
      <span className="font-serif text-xs text-[var(--muted)] tracking-wider">
        {handle}
      </span>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="font-serif text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors px-2 py-1 rounded-full"
          title="登出"
        >
          登出
        </button>
      </form>
    </div>
  );
}
