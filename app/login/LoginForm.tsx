"use client";

import { useActionState, useState } from "react";
import { login, signup, type AuthFormState } from "./actions";

type Mode = "login" | "signup";

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("login");
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    undefined
  );

  return (
    <div className="w-full max-w-sm">
      <div className="flex gap-2 mb-8 justify-center">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`px-5 py-2 rounded-full text-sm font-serif tracking-wider transition-all ${
            mode === "login"
              ? "bg-[var(--accent)]/90 text-[#1A1A2E]"
              : "bg-[var(--background-card)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)]"
          }`}
        >
          登 录
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`px-5 py-2 rounded-full text-sm font-serif tracking-wider transition-all ${
            mode === "signup"
              ? "bg-[var(--accent)]/90 text-[#1A1A2E]"
              : "bg-[var(--background-card)] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)]"
          }`}
        >
          注 册
        </button>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <div>
          <label className="block font-serif text-[var(--accent)] text-sm mb-2 tracking-wider">
            ✦ 邮箱
          </label>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full bg-[var(--background-card)] border border-[var(--border)] rounded-2xl px-5 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--accent)]/50 font-serif transition-colors"
          />
        </div>

        <div>
          <label className="block font-serif text-[var(--accent)] text-sm mb-2 tracking-wider">
            ✦ 密码
          </label>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 6 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "signup" ? "至少 6 位" : "你的密码"}
            className="w-full bg-[var(--background-card)] border border-[var(--border)] rounded-2xl px-5 py-3 text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none focus:border-[var(--accent)]/50 font-serif transition-colors"
          />
        </div>

        {state?.error && (
          <div className="p-3 bg-red-900/30 border border-red-800/50 rounded-2xl text-sm font-serif text-red-300">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 py-4 rounded-full bg-[var(--accent)]/90 hover:bg-[var(--accent)] text-[#1A1A2E] font-serif text-lg tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {pending
            ? "处 理 中…"
            : mode === "login"
            ? "登 录"
            : "注 册 并 登 录"}
        </button>
      </form>
    </div>
  );
}
