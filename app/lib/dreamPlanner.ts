/**
 * 梦境分析 — LLM 版
 *
 * 之前是纯代码模板拼接，bug：模板里 `[translated essence]` 占位符没被替换，
 * 图像 API 直接收到中文 + 占位符字面值，效果崩。
 *
 * 现在让 Claude/JoyAI 看用户中文梦境，输出结构化的镜头分镜 + 真英文 prompt。
 */

import { callChat, extractJson } from "./aiClient";

// ========== 类型 ==========

export type Emotion =
  | "平静" | "喜悦" | "温暖" | "神秘" | "迷茫" | "孤独"
  | "紧张" | "恐惧" | "悲伤" | "愤怒" | "期待" | "怀念";

const VALID_EMOTIONS: Emotion[] = [
  "平静", "喜悦", "温暖", "神秘", "迷茫", "孤独",
  "紧张", "恐惧", "悲伤", "愤怒", "期待", "怀念",
];

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

const STYLE_LABELS: Record<string, string> = {
  watercolor: "水彩",
  lineart: "线稿",
  cyber: "赛博",
  oil: "油画",
  storybook: "绘本",
};

const VALID_STYLES = Object.keys(STYLE_PROMPTS);

type Scene = {
  index: number;
  description_zh: string;
  prompt_en: string;
};

export type DreamPlan = {
  title: string;
  emotions: Emotion[];
  mode: "fragment" | "continuous";
  style_key: string;
  style_label: string;
  scenes: Scene[];
  cover_index: number;
};

// ========== 通用质量增强词 ==========
// 加在每张 prompt 末尾，对抗 AI 味+崩型。
const QUALITY_ANCHOR =
  "highly detailed, professional artwork, masterpiece composition, " +
  "intentional lighting, natural anatomy, harmonious color palette";
const NEGATIVE_HINT =
  "avoid: generic stock illustration, plastic 3d render, deformed faces, " +
  "extra fingers, ugly proportions, watermark, text, signature, low quality, blurry";

// ========== LLM Prompt ==========

const SYSTEM_PROMPT = `你是梦境绘本编辑。用户给你一段中文的梦境描述，你要把它拆成多个画面，并为每个画面写出高质量的英文图像生成 prompt。

# 输出格式
严格输出 JSON（不要写解释、不要 markdown 代码块）：
{
  "title": "<2~6 字中文标题，从内容里提一个核心意象>",
  "emotions": ["<情绪 1>", "<情绪 2>"],
  "mode": "fragment" | "continuous",
  "style_key": "watercolor" | "lineart" | "cyber" | "oil" | "storybook",
  "scenes": [
    { "description_zh": "<中文画面描述，10~25 字>", "prompt_en": "<英文图像 prompt>" }
  ],
  "cover_index": <选其中一张做封面，从 1 开始>
}

# 关键规则

## 情绪
emotions 数组从这 12 类里选 1~2 个：平静/喜悦/温暖/神秘/迷茫/孤独/紧张/恐惧/悲伤/愤怒/期待/怀念。

## 画面数量
- mode="fragment"（用户描述很短/很碎）→ 3 张，从远景/近景/主观三个视角呈现同一意象
- mode="continuous"（用户描述完整）→ 4~6 张，按梦境时序展开

## 画风
如果用户指定了 style_key，就用它。否则按主导情绪选：平静/迷茫/期待→watercolor；喜悦/温暖/怀念→storybook；神秘/紧张/愤怒→cyber；孤独/恐惧→lineart；悲伤→oil。

## prompt_en（最关键）
**绝不能包含任何中文字符**。这是要喂给图像 API 的英文描述。结构：
\`\`\`
<style 短语>, <视觉主体的英文具象描述：what/who/where/doing>, <光线和色调>, <构图视角>, <氛围词>
\`\`\`

具体要求：
- **真正翻译**用户描述里的具象物（不是直译，是视觉再现）。比如"在月亮上散步"→ "a small figure walking on the lunar surface, silver dust trailing behind"
- **同一个梦的多张画面要保持人物/场景一致**：如果用户提到自己，所有画面里"主角"的描述都要一致（同一个 figure，同样穿着）
- **避免空泛词**：不写 "beautiful"、"amazing"，写具体的视觉特征（textures, materials, colors）
- **加情绪化的视觉锚点**：紧张 → "compressed framing, leaning shadows"；平静 → "soft horizontal lines, ample sky"；孤独 → "a solitary figure, vast emptiness around"
- **不带 negative prompt**（系统会另外加），但**不要主动写 generic、stock、cartoon-cute 这种俗烂词**

## description_zh
中文，给用户在 UI 上看的画面说明。10~25 字，不要重复 prompt_en 的英文。

## 例子
用户说"我梦到自己在月亮上慢慢走，没有压力"，emotion="很平静"，style="watercolor"
→ {
  "title": "月光散步",
  "emotions": ["平静"],
  "mode": "fragment",
  "style_key": "watercolor",
  "scenes": [
    { "description_zh": "远眺月球表面，孤身渺小", "prompt_en": "soft watercolor illustration, dreamy translucent washes, paper texture, wide establishing shot of a vast lunar surface seen from afar, a tiny human silhouette in pale clothing walking slowly across the gray-white craters, distant Earth glowing soft blue in the black sky, warm yellow accent light catching dust, low saturation, peaceful dusk atmosphere, ample empty space, ethereal" },
    { "description_zh": "近景：脚下扬起银色尘土", "prompt_en": "soft watercolor illustration, intimate close-up, pale fabric shoes pressing into fine silver moon dust, tiny crystalline particles drifting up in slow motion, soft golden rim light from the side, low contrast, calm, dreamy bleeding pigments at the edges" },
    { "description_zh": "主观视角：仰望深蓝地球", "prompt_en": "soft watercolor illustration, first-person perspective looking up from the moon's surface, the blue Earth large and translucent overhead, faint stars dotting the velvet black sky, peaceful golden horizon glow at the bottom edge, gentle washes of color, no harsh lines" }
  ],
  "cover_index": 1
}`;

// ========== 主函数 ==========

export async function planDream(input: {
  content: string;
  emotion?: string;
  style?: string;
}): Promise<DreamPlan> {
  const content = input.content.trim();
  const emotionText = (input.emotion || "").trim();
  const requestedStyle =
    input.style && VALID_STYLES.includes(input.style) ? input.style : null;

  const userMessage = `用户的梦境描述：
"""
${content}
"""

${emotionText ? `用户描述的情绪："${emotionText}"` : "用户没单独描述情绪，请从内容里推断。"}

${requestedStyle ? `用户指定画风：${STYLE_LABELS[requestedStyle]}（key=${requestedStyle}），style_key 必须用这个。` : "用户选了 AI 推荐画风，请按情绪选。"}

请输出 JSON。`;

  let parsed: DreamPlan | null = null;
  try {
    const reply = await callChat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      { model: "JoyAI-LLM-1.3T", temperature: 0.7, maxTokens: 3000 }
    );
    parsed = extractJson<DreamPlan>(reply);
  } catch (err) {
    console.warn("[dreamPlanner] LLM 调用失败，fallback 到极简 plan：", err);
  }

  return sanitizePlan(parsed, content, requestedStyle);
}

// ========== 净化 LLM 输出 / 兜底 ==========

function sanitizePlan(
  raw: Partial<DreamPlan> | null,
  originalContent: string,
  requestedStyle: string | null
): DreamPlan {
  // 风格：用户指定优先，其次 LLM 返回，再 fallback watercolor
  const styleKey =
    requestedStyle ||
    (raw?.style_key && VALID_STYLES.includes(raw.style_key)
      ? raw.style_key
      : "watercolor");
  const stylePrompt = STYLE_PROMPTS[styleKey];
  const styleLabel = STYLE_LABELS[styleKey];

  // 情绪：净化只留合法值，至少 1 个
  const emotions: Emotion[] = (raw?.emotions || [])
    .filter((e): e is Emotion => VALID_EMOTIONS.includes(e as Emotion))
    .slice(0, 2);
  if (emotions.length === 0) emotions.push("平静");

  // 模式
  const mode: "fragment" | "continuous" =
    raw?.mode === "continuous" ? "continuous" : "fragment";

  // scenes 净化：去掉中文字符还在 prompt_en 里的（fallback 加 style 前缀）
  const rawScenes = Array.isArray(raw?.scenes) ? raw!.scenes! : [];
  const scenes: Scene[] = rawScenes
    .map((s, i): Scene => {
      const promptEn = (s.prompt_en || "").trim();
      // 如果 prompt_en 是空、太短、含大量中文，回退成模板版
      const looksLikeEnglish =
        promptEn.length > 30 && /[a-zA-Z]/.test(promptEn) &&
        (promptEn.match(/[一-鿿]/g) || []).length < 3;
      const finalPrompt = looksLikeEnglish
        ? `${stylePrompt}, ${promptEn}, ${QUALITY_ANCHOR}. ${NEGATIVE_HINT}`
        : `${stylePrompt}, dreamlike scene from a memory, ${QUALITY_ANCHOR}. ${NEGATIVE_HINT}`;
      return {
        index: i + 1,
        description_zh:
          (s.description_zh || "").trim() || `画面 ${i + 1}`,
        prompt_en: finalPrompt,
      };
    })
    .slice(0, 6);

  // 兜底：LLM 完全没给出 scenes 时，至少返回 1 张
  if (scenes.length === 0) {
    scenes.push({
      index: 1,
      description_zh: "梦境画面",
      prompt_en: `${stylePrompt}, a dreamlike memory, soft atmosphere, ${QUALITY_ANCHOR}. ${NEGATIVE_HINT}`,
    });
  }

  // cover_index 净化
  const coverIndex =
    typeof raw?.cover_index === "number" &&
    raw.cover_index >= 1 &&
    raw.cover_index <= scenes.length
      ? raw.cover_index
      : Math.min(2, scenes.length);

  // title 兜底
  const title =
    (raw?.title || "").trim().slice(0, 8) ||
    originalContent.replace(/[，。！？\s]/g, "").slice(0, 6) ||
    "未命名梦";

  return {
    title,
    emotions,
    mode,
    style_key: styleKey,
    style_label: styleLabel,
    scenes,
    cover_index: coverIndex,
  };
}
