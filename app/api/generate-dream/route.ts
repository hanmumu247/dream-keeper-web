import { NextRequest, NextResponse } from "next/server";
import { planDream } from "@/app/lib/dreamPlanner";
import { uploadBase64Jpeg } from "@/app/lib/storage";
import { createClient } from "@/app/lib/supabase/server";

export const maxDuration = 300;

const QUALITY_BY_ENV: "high" | "medium" | "low" =
  (process.env.IMAGE_QUALITY as "high" | "medium" | "low") || "low";

/**
 * 一站式接口：纯代码拆分镜 + 调图像 API 出图
 * 不依赖任何文本对话 LLM。
 */
export async function POST(req: NextRequest) {
  try {
    // 必须登录（proxy 已经拦了，但这里再确认一次拿 user_id）
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json();
    const { content, emotion = "", style = "watercolor" } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "梦境内容不能为空" },
        { status: 400 }
      );
    }

    // ========== Step 1: 纯代码拆分镜 ==========
    console.log("[generate-dream] step 1: 拆分镜（本地）...");
    console.log(`[generate-dream] 用户输入 content: ${JSON.stringify(content)}`);
    console.log(`[generate-dream] 用户输入 emotion: ${JSON.stringify(emotion)}`);
    console.log(`[generate-dream] 用户选 style: ${style}`);
    const plan = await planDream({ content, emotion, style });
    console.log(
      `[generate-dream] 拆出 ${plan.scenes.length} 张：${plan.title} / ${plan.emotions.join("+")} / ${plan.style_label}`
    );

    // ========== Step 2: 并发出图 + 失败重试 ==========
    console.log("[generate-dream] step 2: 并发出图...");
    const apiKey = process.env.JDCLOUD_AI_API_KEY!;
    const apiBase =
      process.env.JDCLOUD_AI_API_URL || "http://ai-api.jdcloud.com";

    type SceneOut = (typeof plan.scenes)[number] & {
      image_url: string | null;
      error: string | null;
    };

    async function generateOne(
      scene: (typeof plan.scenes)[number],
      retries = 3
    ): Promise<SceneOut> {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const upstream = await fetch(`${apiBase}/v1/images/generations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-image-1",
              prompt: scene.prompt_en,
              size: "1024x1024",
              quality: QUALITY_BY_ENV,
              output_format: "JPEG",
              output_compression: 95,
              n: 1,
            }),
          });

          if (upstream.status === 429) {
            // 触发频率限制 → 等一下重试（指数退避）
            const wait = 1500 * (attempt + 1);
            console.warn(
              `[generate-dream] 画面 ${scene.index} 触发限流，等 ${wait}ms 重试...`
            );
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }

          if (!upstream.ok) {
            const errText = await upstream.text();
            return {
              ...scene,
              image_url: null,
              error: errText.slice(0, 200),
            };
          }

          const data = await upstream.json();
          const b64 = data.data?.[0]?.b64_json;
          if (!b64) {
            return { ...scene, image_url: null, error: "no b64 returned" };
          }
          // 上传到 Storage，返回公开 URL（替代之前的 base64 内联）
          const uploaded = await uploadBase64Jpeg(userId, b64);
          if (uploaded.error) {
            return {
              ...scene,
              image_url: null,
              error: `upload: ${uploaded.error}`,
            };
          }
          return {
            ...scene,
            image_url: uploaded.url,
            error: null,
          };
        } catch (err) {
          if (attempt === retries) {
            return { ...scene, image_url: null, error: String(err) };
          }
        }
      }
      return { ...scene, image_url: null, error: "max retries exceeded" };
    }

    // 并发跑全部图，碰到 429 内部自动重试
    const scenesWithImages: SceneOut[] = await Promise.all(
      plan.scenes.map((scene) => generateOne(scene))
    );

    const succeeded = scenesWithImages.filter((s) => s.image_url).length;
    const failed = scenesWithImages.length - succeeded;

    return NextResponse.json({
      title: plan.title,
      emotions: plan.emotions,
      mode: plan.mode,
      style_label: plan.style_label,
      cover_index: plan.cover_index,
      // 原始用户输入 — 给沉淀卡牌、分享文案用
      original_content: content,
      original_emotion: emotion,
      scenes: scenesWithImages,
      stats: {
        total: scenesWithImages.length,
        succeeded,
        failed,
      },
    });
  } catch (err) {
    console.error("[generate-dream] error:", err);
    return NextResponse.json(
      { error: "生成失败", detail: String(err) },
      { status: 500 }
    );
  }
}
