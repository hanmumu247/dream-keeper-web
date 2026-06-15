/**
 * 修订理解 — LLM 版
 *
 * 用户用自由中文描述想怎么改，LLM 输出结构化 operations。
 * Operation update 类型用 new_prompt_full（完整重写后的英文 prompt），
 * 而不是简单拼接 modifier — 拼接对"去掉 X"这类否定指令无效，
 * 因为旧 prompt 还在指引模型生成 X。
 */

import { callChat, extractJson } from "./aiClient";

type Scene = {
  index: number;
  description_zh: string;
  prompt_en: string;
};

export type Operation =
  | {
      action: "update";
      index: number;
      new_prompt_full: string;
      description_modifier: string;
    }
  | { action: "delete"; index: number }
  | {
      action: "add";
      after_index: number;
      prompt: string;
      description: string;
    }
  | { action: "restyle_all"; new_style_key: string; new_style_label: string }
  | { action: "regenerate_all" };

export type RevisionPlan = {
  operations: Operation[];
  summary_zh: string;
};

const VALID_STYLES = ["watercolor", "lineart", "cyber", "oil", "storybook"];

const SYSTEM_PROMPT = `你是一个梦境绘本编辑助手。用户给了你一组已经生成的画面，每张画面有完整的英文 prompt，他用自由中文描述想怎么改，你要把这段描述转成结构化的修改操作。

# 输出格式
严格输出 JSON（不要写任何解释、markdown 标记，只输出 JSON 对象）：
{
  "operations": [...],
  "summary_zh": "用一句中文告诉用户你打算怎么改"
}

# 五种操作类型

## 1. update — 修改某一张画面
{
  "action": "update",
  "index": <1..N>,
  "new_prompt_full": "<完整重写后的英文 prompt — 把用户要求改的内容真的从原 prompt 里改掉，不是拼接>",
  "description_modifier": "<2~6 字中文，给用户看，比如：更暗、加月光、改成晚霞、去掉手>"
}

## 2. delete — 删除某一张
{ "action": "delete", "index": <1..N> }

## 3. add — 新增一张
{ "action": "add", "after_index": <在第几张之后插入>, "prompt": "<完整英文 prompt>", "description": "<中文画面描述，10~30 字>" }

## 4. restyle_all — 整套换风格
{ "action": "restyle_all", "new_style_key": "<watercolor|lineart|cyber|oil|storybook 五选一>", "new_style_label": "<水彩|线稿|赛博|油画|绘本>" }

## 5. regenerate_all — 整套重画
{ "action": "regenerate_all" }

# 关于 new_prompt_full 的关键规则（最重要！）

**这是一次完整重写，不是 modifier 拼接。** 当用户说"去掉手"、"换成晚霞"、"猫改成狗"这种**替换/移除**指令，你必须：

1. **从原 prompt 里真正删除/替换冲突的描述**。例如原 prompt 含 "a pale hand gently touching petals"，用户说"去掉手"，新 prompt 必须删掉 "a pale hand" 整段，**不能保留然后另加 "no hand"**——扩散模型不理解否定。
2. **保留风格短语和不冲突的内容**（"soft watercolor illustration..." 一开头那段、构图视角、不相干的物体）。
3. **正向描述代替的内容**。"去掉手" → 改成 "an unobstructed first-person view"；"换成晚霞" → 把 "moonlight" 替换为 "sunset glow, warm orange and pink sky"。

# 解析准则
- 用户可能用任何说法。理解 **意图**，不要被措辞局限。
- 没明确指定"第几张"时，**优先解释成对所有画面的整体修饰**（每张生成一个 update 操作），不要轻易 regenerate_all。
- 模糊情绪反馈（"不够梦幻"、"太冷了"）→ 整体 update，把情绪转成视觉修饰。
- new_prompt_full 必须是纯英文，不能含中文/占位符。
- 用户说"换成线稿/水彩"等 → restyle_all。
- 同一句话可能要多个操作。
- summary_zh 简短，第一人称。

# 例子

当前 scenes：
[1] description: "森林里有月光" | prompt_en: "soft watercolor illustration, dreamlike forest at night, silver moonlight filtering through tall trees, gentle blue tones"
[2] description: "主观视角：手抚花瓣望向屋前" | prompt_en: "soft watercolor illustration, first-person perspective, a pale hand gently touching flower petals in the foreground, looking toward a wooden cottage, warm pink and green tones"

## 例 1：去掉手
用户说"第 2 张去掉手"
→ {
  "operations":[{
    "action":"update",
    "index":2,
    "new_prompt_full":"soft watercolor illustration, first-person perspective, an unobstructed view through soft pink flower petals filling the foreground, looking toward a wooden cottage in the distance, warm pink and green tones, peaceful atmosphere",
    "description_modifier":"去掉手"
  }],
  "summary_zh":"画面 2 去掉了手，改成纯主观视角穿过花瓣望向小屋。"
}
（注意：旧 prompt 里的 "a pale hand gently touching flower petals" 整段被删除并替换为 "an unobstructed view through soft pink flower petals"。不再有 hand。）

## 例 2：调暗
用户说"第 1 张感觉太亮了，能暗一点吗"
→ {
  "operations":[{
    "action":"update",
    "index":1,
    "new_prompt_full":"soft watercolor illustration, dreamlike forest at night, faint silver moonlight barely filtering through dense tall trees, deep blue and indigo tones, much darker shadows, low overall exposure",
    "description_modifier":"更暗"
  }],
  "summary_zh":"画面 1 调暗了。"
}

## 例 3：替换元素
用户说"第 1 张里月光改成晚霞"
→ {
  "operations":[{
    "action":"update",
    "index":1,
    "new_prompt_full":"soft watercolor illustration, dreamlike forest at dusk, warm orange and pink sunset glow filtering through tall trees, golden hour light, peaceful warm tones",
    "description_modifier":"月光改晚霞"
  }],
  "summary_zh":"画面 1 的月光换成晚霞。"
}

## 例 4：加元素
用户说"第 1 张加只白猫"
→ {
  "operations":[{
    "action":"update",
    "index":1,
    "new_prompt_full":"soft watercolor illustration, dreamlike forest at night, silver moonlight filtering through tall trees, a small white cat sitting calmly on a moss-covered rock in the foreground, gazing toward the moonlight, gentle blue tones",
    "description_modifier":"加只白猫"
  }],
  "summary_zh":"画面 1 加了一只白猫。"
}

## 例 5：整体氛围
用户说"整体不够梦幻"
→ 给每张都生成 new_prompt_full，每张都加进梦幻锚点（hazy glow, ethereal mist, soft surreal atmosphere）但保留各自原本的主体内容。`;

export async function parseRevision(
  userRequest: string,
  currentScenes: Scene[]
): Promise<RevisionPlan> {
  // 把每张画面的完整 prompt_en 也给 LLM 看 — 让它能真正改写
  const scenesDetail = currentScenes
    .map(
      (s) =>
        `[${s.index}] description: "${s.description_zh}"\n    prompt_en: "${s.prompt_en}"`
    )
    .join("\n");

  const userMessage = `当前 ${currentScenes.length} 张画面：
${scenesDetail}

用户的修改请求："${userRequest}"

请输出 JSON。重申：update 操作的 new_prompt_full 必须是完整重写过的、删掉了冲突描述的英文 prompt。`;

  try {
    const reply = await callChat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      { model: "JoyAI-LLM-1.3T", temperature: 0.3, maxTokens: 4000 }
    );

    const parsed = extractJson<RevisionPlan>(reply);

    if (!parsed?.operations || !Array.isArray(parsed.operations)) {
      throw new Error("LLM 返回的 operations 不是数组");
    }

    const cleaned = parsed.operations
      .map((op) => sanitizeOperation(op, currentScenes))
      .filter((op): op is Operation => op !== null);

    if (cleaned.length === 0) {
      throw new Error("LLM 返回的 operations 全部无效");
    }

    return {
      operations: cleaned,
      summary_zh: parsed.summary_zh || "已按你的描述修改。",
    };
  } catch (err) {
    console.warn("[revisionParser] LLM 解析失败，fallback 到整套重画：", err);
    return {
      operations: [{ action: "regenerate_all" }],
      summary_zh: "我没完全理解你的修改请求，整套重画一遍试试。",
    };
  }
}

/**
 * 净化 LLM 输出：校验 index、style 白名单、必填字段非空。
 * 任何关键字段缺失就返回 null，由上层过滤掉。
 */
function sanitizeOperation(
  op: Partial<Operation> & { action?: string },
  scenes: Scene[]
): Operation | null {
  const maxIndex = scenes.length;

  switch (op.action) {
    case "update": {
      const o = op as Extract<Operation, { action: "update" }> & {
        prompt_modifier?: string;
      };
      // 兼容老字段名 prompt_modifier — 万一 LLM 还在用
      const fullPrompt = o.new_prompt_full?.trim() || o.prompt_modifier?.trim();
      if (
        typeof o.index !== "number" ||
        o.index < 1 ||
        o.index > maxIndex ||
        !fullPrompt
      )
        return null;
      // 防御中文混入 prompt
      const chineseChars = (fullPrompt.match(/[一-鿿]/g) || []).length;
      if (chineseChars > 3) return null;
      return {
        action: "update",
        index: o.index,
        new_prompt_full: fullPrompt,
        description_modifier: o.description_modifier?.trim() || "已调整",
      };
    }
    case "delete": {
      const o = op as Extract<Operation, { action: "delete" }>;
      if (typeof o.index !== "number" || o.index < 1 || o.index > maxIndex)
        return null;
      return { action: "delete", index: o.index };
    }
    case "add": {
      const o = op as Extract<Operation, { action: "add" }>;
      if (!o.prompt?.trim()) return null;
      return {
        action: "add",
        after_index:
          typeof o.after_index === "number" ? o.after_index : maxIndex,
        prompt: o.prompt.trim(),
        description: o.description?.trim() || "新增的画面",
      };
    }
    case "restyle_all": {
      const o = op as Extract<Operation, { action: "restyle_all" }>;
      if (!VALID_STYLES.includes(o.new_style_key)) return null;
      return {
        action: "restyle_all",
        new_style_key: o.new_style_key,
        new_style_label: o.new_style_label || o.new_style_key,
      };
    }
    case "regenerate_all":
      return { action: "regenerate_all" };
    default:
      return null;
  }
}
