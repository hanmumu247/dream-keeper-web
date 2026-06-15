/**
 * 修订理解 — LLM 版
 *
 * 之前是纯规则匹配（只认固定字典里的词），用户稍微换个说法就 fallback 到"整套重画"。
 * 现在让 Claude 看用户原话和当前 scenes，输出结构化的 operations。
 *
 * Operation 类型保持不变 — route.ts 的 applyOperation 不用动。
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
      prompt_modifier: string;
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

const SYSTEM_PROMPT = `你是一个梦境绘本编辑助手。用户给了你一组已经生成的画面，他用自由中文描述想怎么改，你要把这段描述转成结构化的修改操作。

# 输出格式
严格输出 JSON（不要写任何解释、markdown 标记，只输出 JSON 对象）：
{
  "operations": [...],
  "summary_zh": "用一句中文告诉用户你打算怎么改"
}

# 五种操作类型

## 1. update — 修改某一张
{ "action": "update", "index": <1..N>, "prompt_modifier": "<英文修饰词，会拼到该图的 prompt 末尾>", "description_modifier": "<2~6 字中文，给用户看，比如：更暗、加月光、改成晚霞>" }

## 2. delete — 删除某一张
{ "action": "delete", "index": <1..N> }

## 3. add — 新增一张
{ "action": "add", "after_index": <在第几张之后插入>, "prompt": "<完整英文 prompt，描述这张新画面>", "description": "<中文画面描述，10~30 字>" }

## 4. restyle_all — 整套换风格
{ "action": "restyle_all", "new_style_key": "<watercolor|lineart|cyber|oil|storybook 五选一>", "new_style_label": "<水彩|线稿|赛博|油画|绘本>" }

## 5. regenerate_all — 整套重画（仅当用户明确说"重画/重来/全部重画"时使用）
{ "action": "regenerate_all" }

# 解析准则
- 用户可能用任何说法。理解 **意图**，不要被措辞局限。
- 没明确指定"第几张"时，**优先解释成对所有画面的整体修饰**（每张生成一个 update 操作），不要轻易 regenerate_all。
- 模糊的情绪反馈（"不够梦幻"、"感觉太冷了"、"想要更柔和"）→ 都是整体 update，把情绪转成视觉修饰词。
- prompt_modifier 必须是英文（要喂给 image API），description_modifier 必须是中文（要给用户看）。
- 用户提到具体颜色/物体/天气/时间等具象元素时，直接放进 prompt_modifier，不要套字典。例如"加一只猫" → "with a cat sitting in the scene"。
- 用户说"换成线稿/水彩/...风" 走 restyle_all，new_style_key 必须从 watercolor/lineart/cyber/oil/storybook 五个里选。
- 同一句话可能要多个操作，operations 数组就放多个。
- summary_zh 用第一人称，给用户的反馈，简短（一句话）。

# 例子
当前 scenes（示例）：[{index:1,description:"森林里有月光"}, {index:2,description:"湖面倒映星空"}]

用户说"第 2 张感觉太亮了，能暗一点吗"
→ {"operations":[{"action":"update","index":2,"prompt_modifier":"darker, dimmer lighting, deeper shadows","description_modifier":"更暗"}],"summary_zh":"画面 2 调暗了。"}

用户说"整体不够梦幻"
→ {"operations":[{"action":"update","index":1,"prompt_modifier":"more dreamy ethereal atmosphere, soft glow, hazy","description_modifier":"更梦幻"},{"action":"update","index":2,"prompt_modifier":"more dreamy ethereal atmosphere, soft glow, hazy","description_modifier":"更梦幻"}],"summary_zh":"整体加了梦幻氛围。"}

用户说"第一张加只白色的猫"
→ {"operations":[{"action":"update","index":1,"prompt_modifier":"with a white cat sitting in the scene","description_modifier":"加只白猫"}],"summary_zh":"画面 1 加了一只白猫。"}

用户说"全部换成水彩"
→ {"operations":[{"action":"restyle_all","new_style_key":"watercolor","new_style_label":"水彩"}],"summary_zh":"全部改成水彩风。"}`;

export async function parseRevision(
  userRequest: string,
  currentScenes: Scene[]
): Promise<RevisionPlan> {
  const scenesSummary = currentScenes
    .map((s) => `[${s.index}] ${s.description_zh}`)
    .join("\n");

  const userMessage = `当前 ${currentScenes.length} 张画面：
${scenesSummary}

用户的修改请求："${userRequest}"

请输出 JSON。`;

  try {
    const reply = await callChat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      { model: "JoyAI-LLM-1.3T", temperature: 0.3, maxTokens: 2000 }
    );

    const parsed = extractJson<RevisionPlan>(reply);

    // 校验 + 净化
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
 * 防御 LLM 返回不规范字段：检查 index 在范围内、style 在白名单内、必填字段非空。
 * 任何关键字段缺失就返回 null，由上层过滤掉。
 */
function sanitizeOperation(
  op: Partial<Operation> & { action?: string },
  scenes: Scene[]
): Operation | null {
  const maxIndex = scenes.length;

  switch (op.action) {
    case "update": {
      const o = op as Extract<Operation, { action: "update" }>;
      if (
        typeof o.index !== "number" ||
        o.index < 1 ||
        o.index > maxIndex ||
        !o.prompt_modifier?.trim()
      )
        return null;
      return {
        action: "update",
        index: o.index,
        prompt_modifier: o.prompt_modifier.trim(),
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
