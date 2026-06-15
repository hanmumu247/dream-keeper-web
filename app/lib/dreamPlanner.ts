/**
 * 梦境分析 — 纯代码实现，不调 LLM
 *
 * 做 4 件事：
 *  1) 关键词匹配把用户的情绪自由表述归到 12 类
 *  2) 字数判断碎片/连续模式
 *  3) 用模板拼出每张画面的英文 prompt + 中文描述
 *  4) 选封面 + 生成标题
 */

// ========== 12 类情绪 ==========
type Emotion =
  | "平静" | "喜悦" | "温暖" | "神秘" | "迷茫" | "孤独"
  | "紧张" | "恐惧" | "悲伤" | "愤怒" | "期待" | "怀念";

const EMOTION_KEYWORDS: Record<Emotion, string[]> = {
  平静: ["安详", "宁静", "放松", "淡定", "舒服", "平和", "安然", "平静"],
  喜悦: ["开心", "兴奋", "雀跃", "笑", "欢快", "愉悦", "高兴", "快乐"],
  温暖: ["感动", "被爱", "依恋", "安心", "拥抱", "归属", "亲密", "温暖", "暖"],
  神秘: ["奇怪", "超现实", "迷离", "看不清", "诡异", "玄妙", "不真实", "神秘", "诡"],
  迷茫: ["困惑", "找不到", "空白", "不知道", "混乱", "走丢", "没头绪", "迷茫", "迷"],
  孤独: ["一个人", "空旷", "无声", "被丢下", "没人", "寂寞", "独自", "孤独"],
  紧张: ["心跳", "被追", "赶时间", "来不及", "焦虑", "压迫", "急", "紧张", "慌", "紧"],
  恐惧: ["害怕", "逃", "可怕", "噩梦", "毛骨悚然", "恐怖", "怕", "恐惧"],
  悲伤: ["哭", "失去", "告别", "心痛", "难过", "伤心", "哀伤", "悲伤", "悲"],
  愤怒: ["气", "吵架", "打架", "恨", "怒", "火大", "发疯", "愤怒"],
  期待: ["盼望", "等待", "希望", "憧憬", "向往", "期待", "好奇"],
  怀念: ["童年", "老朋友", "回忆", "想念", "过去", "记忆", "念旧", "怀念"],
};

const EMOTION_COLORS: Record<Emotion, string> = {
  平静: "warm yellow tones, soft golden light, low saturation, peaceful dusk",
  喜悦: "bright vibrant colors, sunlight, rainbow tones, uplifting",
  温暖: "warm orange and gold, soft glow, intimate light",
  神秘: "purple and deep blue, foggy, half-transparent, surreal",
  迷茫: "grey-white tones, low saturation, blurred edges, misty",
  孤独: "cool blue tones, vast negative space, distant perspective",
  紧张: "cold red, sharp angles, oppressive composition, urgent",
  恐惧: "deep black tones, distorted perspective, heavy shadows",
  悲伤: "muted blue-grey, rain texture, downward lines",
  愤怒: "deep red and fire, explosive feeling, harsh contrast",
  期待: "morning light, pale gold, upward rays of hope",
  怀念: "faded sepia tones, vintage colors, dreamlike haze",
};

// 把"很慌但又有点期待"这种话归到 12 类，最多保留 2 个
function classifyEmotions(emotionText: string): Emotion[] {
  if (!emotionText || !emotionText.trim()) return ["平静"];

  const scores: Array<[Emotion, number]> = [];
  for (const emo of Object.keys(EMOTION_KEYWORDS) as Emotion[]) {
    const kws = EMOTION_KEYWORDS[emo];
    let s = 0;
    for (const kw of kws) {
      const occurrences = (emotionText.match(new RegExp(kw, "g")) || []).length;
      s += occurrences;
    }
    if (s > 0) scores.push([emo, s]);
  }

  if (scores.length === 0) return ["平静"];
  scores.sort((a, b) => b[1] - a[1]);
  return scores.slice(0, 2).map(([e]) => e);
}

// ========== 5 种画风 ==========
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
  auto: "AI 推荐",
};

// auto 模式：根据主导情绪挑画风
const EMOTION_TO_STYLE: Record<Emotion, string> = {
  平静: "watercolor",
  喜悦: "storybook",
  温暖: "storybook",
  神秘: "cyber",
  迷茫: "watercolor",
  孤独: "lineart",
  紧张: "cyber",
  恐惧: "lineart",
  悲伤: "oil",
  愤怒: "cyber",
  期待: "watercolor",
  怀念: "storybook",
};

function resolveStyle(input: string, emotions: Emotion[]): string {
  if (input && input !== "auto" && STYLE_PROMPTS[input]) return input;
  return EMOTION_TO_STYLE[emotions[0]] || "watercolor";
}

// ========== 把内容拆成 N 个画面 ==========

type Scene = {
  index: number;
  description_zh: string;
  prompt_en: string;
};

// 简单分句：按中文标点切
function splitContent(content: string): string[] {
  const parts = content
    .split(/[，。！？；,.!?;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts;
}

// 提取标题：从内容中找 1 个核心意象
function extractTitle(content: string): string {
  // 寻找形容词+名词组合，或地点名词
  const candidates: string[] = [];

  // 找 "在/到 XX 里/中/上"
  const places = content.match(/(?:在|到)([^，。！？\s]{2,8})(?:里|中|上|下|内|外|前|后|的)/g);
  if (places) {
    candidates.push(
      ...places.map((s) => s.replace(/^(在|到)/, "").replace(/(里|中|上|下|内|外|前|后|的)$/, ""))
    );
  }

  // 找形容词+名词（紫色房子、漂浮的城市）
  const adjNoun = content.match(/[紫红蓝绿黑白金银]色?[^\s，。！？]{1,4}|漂浮[^\s，。！？]{1,4}|奇怪[^\s，。！？]{1,4}/g);
  if (adjNoun) candidates.push(...adjNoun);

  if (candidates.length > 0) {
    return candidates[0].slice(0, 8);
  }

  // 取前 6 字
  return content.slice(0, 6).replace(/[，。！？]/g, "");
}

// ========== 主函数 ==========

export type DreamPlan = {
  title: string;
  emotions: Emotion[];
  mode: "fragment" | "continuous";
  style_key: string;
  style_label: string;
  scenes: Scene[];
  cover_index: number;
};

export function planDream(input: {
  content: string;
  emotion?: string;
  style?: string;
}): DreamPlan {
  const content = input.content.trim();
  const emotionText = (input.emotion || "").trim();

  const emotions = classifyEmotions(emotionText || content);
  const styleKey = resolveStyle(input.style || "watercolor", emotions);
  const stylePrompt = STYLE_PROMPTS[styleKey];
  const styleLabel = STYLE_LABELS[styleKey];
  const colorPrompt =
    EMOTION_COLORS[emotions[0]] +
    (emotions[1] ? `, blended with ${EMOTION_COLORS[emotions[1]]}` : "");

  // 模式判断
  const mode: "fragment" | "continuous" =
    content.length < 30 ? "fragment" : "continuous";
  const sceneCount = mode === "fragment" ? 3 : Math.min(6, Math.max(4, splitContent(content).length));

  // 拆分内容
  const sentences = splitContent(content);
  const scenes: Scene[] = [];

  if (mode === "fragment") {
    // 碎片模式：3 张，从不同视角呈现同一意象
    const angles = [
      { zh: "远景视角", en: "wide establishing shot, distant view" },
      { zh: "近景细节", en: "intimate close-up, focus on textural details" },
      { zh: "主观视角", en: "first-person perspective, you are inside the scene" },
    ];
    for (let i = 0; i < 3; i++) {
      const angle = angles[i];
      scenes.push({
        index: i + 1,
        description_zh: buildSceneDesc(content, angle.zh, styleLabel, emotions, i + 1),
        prompt_en: `${stylePrompt}, ${angle.en}, ${content} [translated essence], ${colorPrompt}, dreamlike, evocative`,
      });
    }
  } else {
    // 连续模式：按句子顺序生成 N 张
    for (let i = 0; i < sceneCount; i++) {
      const sentence = sentences[i] || sentences[sentences.length - 1] || content;
      scenes.push({
        index: i + 1,
        description_zh: buildSceneDesc(sentence, "", styleLabel, emotions, i + 1),
        prompt_en: `${stylePrompt}, scene ${i + 1} of a dream sequence: ${sentence} [essence], ${colorPrompt}, cinematic, dreamlike narrative flow`,
      });
    }
  }

  // 选封面：碎片选第 2 张，连续选最后一张
  const cover_index = mode === "fragment" ? 2 : sceneCount;

  return {
    title: extractTitle(content),
    emotions,
    mode,
    style_key: styleKey,
    style_label: styleLabel,
    scenes,
    cover_index,
  };
}

function buildSceneDesc(
  sentence: string,
  angleHint: string,
  styleLabel: string,
  emotions: Emotion[],
  sceneIndex: number
): string {
  const emoText = emotions.join(" + ");
  const angle = angleHint ? `（${angleHint}）` : "";
  return `${styleLabel}风。${angle}${sentence}。画面里弥漫着${emoText}的氛围，你能感觉到那一刻的情绪从画面中渗出来。`;
}
