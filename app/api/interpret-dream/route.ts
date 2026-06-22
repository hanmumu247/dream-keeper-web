import { NextRequest, NextResponse } from "next/server";
import { callChat, extractJson } from "@/app/lib/aiClient";
import { createClient } from "@/app/lib/supabase/server";

export const maxDuration = 60;

type Interpretation = {
  traditional: string;
  psychological: string;
  created_at: string;
};

const SYSTEM_PROMPT = `你是一个温和的"梦境讲解人"。用户给你一个 ta 做过的梦，你要从两个角度给 ta 一段中文解读。严格输出 JSON，不要 markdown 代码块、不要多余说明：

{
  "traditional": "<传统签占视角，3~5 句，用《周公解梦》式的口吻，挑梦里 2~4 个最显著的意象做象征解读，可以提一句吉凶倾向，但不要绝对化（'多主...'、'近来...'，不要说'你一定会...'）。语气古朴温润，像签文。>",
  "psychological": "<心理学视角，3~5 句。从梦里的情绪、关系、动作里看出可能反映的现实情绪/未尽的事/最近的关切。用'也许'、'似乎'这种试探性的话语，避免下定论。最后留一个开放式的反思问句，让用户自己回答。>"
}

# 风格要求
- 两段都用第二人称"你"。
- 传统视角不超过 100 字，心理视角不超过 120 字。
- 不要重复梦的原文，不要列点，写成自然段落。
- 不出现"周公解梦"、"弗洛伊德"这种品牌词，避免显得套路。
- 不要给医疗、命理或决策建议（"建议你做 X"、"会发财"等都不行）。
- 用户提供的梦可能很短或很碎，按它实际提供的信息来解，不要瞎补。

# 例子
用户的梦："我在月亮上慢慢走，没有压力，远处地球很蓝。"
你输出：
{
  "traditional": "月者，幽静明照；行于月上，多主心境澄明、近日少扰。地球远在天际而独显其蓝，象征你在抽身回望，事虽繁却得以从远处看清。脚步不急，近来宜守静、莫强求。",
  "psychological": "这个梦里没有追赶、也没有目的地，似乎是你心里一段难得的喘息。蓝色的地球在远处而不在脚下，也许暗示最近你想从某些日常责任里短暂抽离，看看自己真正在意什么。你最近有没有一件事，是你一直想'退一步看看'但还没让自己真正退过？"
}`;

export async function POST(req: NextRequest) {
  try {
    // 鉴权
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await req.json();
    const { dreamId, force = false } = body as {
      dreamId?: string;
      force?: boolean;
    };

    if (!dreamId) {
      return NextResponse.json({ error: "缺少 dreamId" }, { status: 400 });
    }

    // 拉这条梦（RLS 自然保证只能读自己的）
    const { data: row, error: fetchErr } = await supabase
      .from("dreams")
      .select(
        "id, title, emotions, original_content, original_emotion, scenes, interpretation"
      )
      .eq("id", dreamId)
      .maybeSingle();

    if (fetchErr || !row) {
      return NextResponse.json(
        { error: "找不到这个梦" },
        { status: 404 }
      );
    }

    // 如果已经有解读且没要求 force，直接返回
    if (!force && row.interpretation) {
      return NextResponse.json({ interpretation: row.interpretation });
    }

    // 拼用户消息给 LLM
    const sceneSummary = (row.scenes as Array<{ description_zh: string }>)
      .map((s, i) => `画面${i + 1}：${s.description_zh}`)
      .join("\n");

    const userMessage = `梦的标题：${row.title}
梦里的情绪：${(row.emotions as string[]).join("、")}

用户原文：
${row.original_content}

${row.original_emotion ? `用户描述的感受：${row.original_emotion}\n` : ""}画面（${
      (row.scenes as unknown[]).length
    }张）：
${sceneSummary}

请输出 JSON。`;

    let parsed: { traditional?: string; psychological?: string } | null = null;
    try {
      const reply = await callChat(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        { temperature: 0.8, maxTokens: 1500 }
      );
      parsed = extractJson(reply);
    } catch (err) {
      console.error("[interpret-dream] LLM 调用失败：", err);
      return NextResponse.json(
        { error: "解梦服务暂时不可用，稍后再试" },
        { status: 502 }
      );
    }

    const traditional = (parsed?.traditional || "").trim();
    const psychological = (parsed?.psychological || "").trim();
    if (!traditional || !psychological) {
      return NextResponse.json(
        { error: "解梦结果格式异常，请重试" },
        { status: 502 }
      );
    }

    const interpretation: Interpretation = {
      traditional,
      psychological,
      created_at: new Date().toISOString(),
    };

    // 写回数据库（RLS 限制只能更新自己的）
    const { error: updateErr } = await supabase
      .from("dreams")
      .update({ interpretation })
      .eq("id", dreamId);

    if (updateErr) {
      console.error("[interpret-dream] 写回数据库失败：", updateErr);
      // 即便写回失败，仍把结果返回给前端展示一次
    }

    return NextResponse.json({ interpretation });
  } catch (err) {
    console.error("[interpret-dream] error:", err);
    return NextResponse.json(
      { error: "解梦失败", detail: String(err) },
      { status: 500 }
    );
  }
}
