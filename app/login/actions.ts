"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";

export type AuthFormState = {
  error?: string;
} | undefined;

export async function login(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "邮箱和密码都要填" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: zhAuthError(error.message) };
  }

  redirect("/");
}

export async function signup(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "邮箱和密码都要填" };
  }
  if (password.length < 6) {
    return { error: "密码至少 6 位" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { error: zhAuthError(error.message) };
  }

  redirect("/");
}

function zhAuthError(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return "邮箱或密码不对";
  if (/User already registered/i.test(msg)) return "这个邮箱已经注册过了";
  if (/email/i.test(msg) && /invalid/i.test(msg)) return "邮箱格式不对";
  if (/password/i.test(msg)) return "密码格式不对";
  return msg;
}
