import { NextRequest, NextResponse } from "next/server";
import { parseRevision, Operation } from "@/app/lib/revisionParser";
import { uploadBase64Jpeg } from "@/app/lib/storage";
import { createClient } from "@/app/lib/supabase/server";

export const maxDuration = 300;

const QUALITY_BY_ENV: "high" | "medium" | "low" =
  (process.env.IMAGE_QUALITY as "high" | "medium" | "low") || "low";

type Scene = {
  index: number;
  description_zh: string;
  prompt_en: string;
  image_url: string | null;
  error?: string | null;
};

const STYLE_PROMPTS: Record<string, string> = {
  watercolor:
    "soft watercolor illustration, dreamy translucent washes, gentle bleeding pigments, paper texture, ethereal atmosphere",
  lineart:
    "minimalist black and white line art, expressive ink lines, heavy negative space, silhouettes, dreamlike emptiness",
  cyber:
    "cyberpunk neon dreamscape, vivid neon colors, surreal high saturation, glowing edges, vaporwave aesthetic",
  oil:
    "classical oil painting, thick brush strokes, dramatic chiaroscuro, 19th century romantic, epic mood",
  storybook:
    "warm storybook illustration, flat shapes, gentle colors, childlike simplicity, picture book aesthetic",
};

/**
 * 修订接口
 * 输入：{ scenes: Scene[], userRequest: string, currentStyleKey: string }
 * 输出：{ scenes: Scene[] (新的图集), summary: string }
 */
export async function POST(req: NextRequest) {
  try {
    // 鉴权 + 拿 user.id 用于上传 Storage
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    const {
      scenes: currentScenes,
      userRequest,
      currentStyleKey = "watercolor",
      currentStyleLabel = "水彩",
    } = body as {
      scenes: Scene[];
      userRequest: string;
      currentStyleKey: string;
      currentStyleLabel: string;
    };

    if (!Array.isArray(currentScenes) || currentScenes.length === 0) {
      return NextResponse.json(
        { error: "缺少当前图集" },
        { status: 400 }
      );
    }

    if (!userRequest || !userRequest.trim()) {
      return NextResponse.json(
        { error: "修改请求不能为空" },
        { status: 400 }
      );
    }

    console.log(
      `[revise-dream] 用户请求："${userRequest}" 当前 ${currentScenes.length} 张`
    );
    console.log(
      `[revise-dream] 当前画面：${currentScenes.map((s) => `[${s.index}] ${s.description_zh.slice(0, 40)}`).join(" | ")}`
    );

    const plan = await parseRevision(userRequest, currentScenes);
    console.log(
      `[revise-dream] 解析出 ${plan.operations.length} 个操作：${plan.operations.map((o) => o.action).join(",")}`
    );

    let newScenes: Scene[] = [...currentScenes];
    let newStyleKey = currentStyleKey;
    let newStyleLabel = currentStyleLabel;

    // 处理操作
    for (const op of plan.operations) {
      newScenes = await applyOperation(op, newScenes, newStyleKey, user.id);
      if (op.action === "restyle_all") {
        newStyleKey = op.new_style_key;
        newStyleLabel = op.new_style_label;
      }
    }

    // 重新编号
    newScenes = newScenes.map((s, i) => ({ ...s, index: i + 1 }));

    return NextResponse.json({
      scenes: newScenes,
      summary: plan.summary_zh,
      style_key: newStyleKey,
      style_label: newStyleLabel,
    });
  } catch (err) {
    console.error("[revise-dream] error:", err);
    return NextResponse.json(
      { error: "修订失败", detail: String(err) },
      { status: 500 }
    );
  }
}

async function applyOperation(
  op: Operation,
  scenes: Scene[],
  styleKey: string,
  userId: string
): Promise<Scene[]> {
  switch (op.action) {
    case "delete":
      return scenes.filter((s) => s.index !== op.index);

    case "regenerate_all": {
      const result: Scene[] = [];
      for (const s of scenes) {
        const img = await callImageApi(s.prompt_en, userId);
        result.push({ ...s, image_url: img.image_url, error: img.error });
        await sleep(1200);
      }
      return result;
    }

    case "restyle_all": {
      const newStylePrompt = STYLE_PROMPTS[op.new_style_key];
      const result: Scene[] = [];
      for (const s of scenes) {
        // 把旧 style 前缀替换为新的
        const newPrompt = `${newStylePrompt}, ${s.prompt_en.split(",").slice(5).join(",").trim()}`;
        const img = await callImageApi(newPrompt, userId);
        result.push({
          ...s,
          prompt_en: newPrompt,
          description_zh: s.description_zh.replace(/^[^风]+风/, `${op.new_style_label}风`),
          image_url: img.image_url,
          error: img.error,
        });
        await sleep(1200);
      }
      return result;
    }

    case "update": {
      const result: Scene[] = [];
      for (const s of scenes) {
        if (s.index === op.index) {
          // 用 LLM 重写后的完整 prompt 替换旧 prompt（不再拼接 modifier — 拼接对"去掉 X"无效）
          const newPrompt = op.new_prompt_full;
          const img = await callImageApi(newPrompt, userId);
          result.push({
            ...s,
            prompt_en: newPrompt,
            description_zh: `${s.description_zh}（已${op.description_modifier}）`,
            image_url: img.image_url,
            error: img.error,
          });
          await sleep(1200);
        } else {
          result.push(s);
        }
      }
      return result;
    }

    case "add": {
      const img = await callImageApi(op.prompt, userId);
      const newScene: Scene = {
        index: scenes.length + 1,
        description_zh: op.description,
        prompt_en: op.prompt,
        image_url: img.image_url,
        error: img.error,
      };
      // 插入到 after_index 之后
      const newScenes = [...scenes];
      const insertAt = scenes.findIndex((s) => s.index === op.after_index);
      if (insertAt === -1) {
        newScenes.push(newScene);
      } else {
        newScenes.splice(insertAt + 1, 0, newScene);
      }
      return newScenes;
    }
  }
}

async function callImageApi(
  prompt: string,
  userId: string,
  retries = 2
): Promise<{ image_url: string | null; error: string | null }> {
  const apiKey = process.env.JDCLOUD_AI_API_KEY!;
  const apiBase =
    process.env.JDCLOUD_AI_API_URL || "http://ai-api.jdcloud.com";

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
          prompt,
          size: "1024x1024",
          quality: QUALITY_BY_ENV,
          output_format: "JPEG",
          output_compression: 95,
          n: 1,
        }),
      });

      if (upstream.status === 429) {
        await sleep((attempt + 1) * 3000);
        continue;
      }

      if (!upstream.ok) {
        return { image_url: null, error: (await upstream.text()).slice(0, 200) };
      }

      const data = await upstream.json();
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) return { image_url: null, error: "no b64" };

      // 上传 Storage 拿公开 URL
      const uploaded = await uploadBase64Jpeg(userId, b64);
      if (uploaded.error) {
        return { image_url: null, error: `upload: ${uploaded.error}` };
      }
      return { image_url: uploaded.url, error: null };
    } catch (err) {
      if (attempt === retries) {
        return { image_url: null, error: String(err) };
      }
    }
  }
  return { image_url: null, error: "max retries" };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
