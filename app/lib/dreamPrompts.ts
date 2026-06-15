/**
 * 梦境分镜 prompt 设计
 *
 * 让 Claude 完成 4 件事：
 *  1) 把用户口语化的情绪表述归类到 12 类情绪（最多 2 个）
 *  2) 判断梦的"长度"决定生成 3 张（碎片）还是 4-6 张（连续）
 *  3) 为每张画面生成英文 prompt（给图像 API 用）+ 中文描述（给用户看）
 *  4) 推荐一张作为封面 + 一个梦境标题
 */

const STYLE_PROMPTS: Record<string, string> = {
  watercolor:
    "soft watercolor illustration, dreamy translucent washes, gentle bleeding pigments, paper texture, ethereal atmosphere",
  lineart:
    "minimalist black and white line art, expressive ink lines, heavy negative space, silhouettes, dreamlike emptiness",
  cyber:
    "cyberpunk neon dreamscape, vivid neon colors, surreal high saturation, glowing edges, vaporwave aesthetic",
  oil:
    "classical oil painting, thick brush strokes, dramatic chiaroscuro, 19th century romantic painting, epic mood",
  storybook:
    "warm storybook illustration, flat shapes, gentle colors, childlike simplicity, picture book aesthetic",
  auto: "auto",
};

const STYLE_LABELS: Record<string, string> = {
  watercolor: "水彩",
  lineart: "线稿",
  cyber: "赛博",
  oil: "油画",
  storybook: "绘本",
  auto: "AI 推荐",
};

export type DreamSceneRequest = {
  content: string;
  emotion?: string;
  style?: string;
};

export function buildDreamPrompt(req: DreamSceneRequest): {
  system: string;
  user: string;
} {
  const styleKey = req.style && STYLE_PROMPTS[req.style] ? req.style : "watercolor";
  const styleLabel = STYLE_LABELS[styleKey];
  const stylePrompt = STYLE_PROMPTS[styleKey];

  const system = `你是"Dream Keeper"——梦境管理器的专属画师。
你的任务：把用户用自然语言描述的梦境，转成可以让 AI 出图模型作画的"分镜剧本"。

工作流程：
1. **判断模式**：用户内容 < 30 字 = 碎片模式（生成 3 张），>= 30 字 = 连续模式（生成 4-6 张分镜，按梦的故事顺序）
2. **归类情绪**：把用户的情绪自由表述归到 12 类（最多保留 2 个最强的）：
   平静 / 喜悦 / 温暖 / 神秘 / 迷茫 / 孤独 / 紧张 / 恐惧 / 悲伤 / 愤怒 / 期待 / 怀念
3. **每张画面**给出：
   - 中文描述（给用户看）：2-4 句，第二人称"你"，有画面感，有情绪暗示
   - 英文 prompt（给图像 API）：详细、精准、画面元素清晰、风格关键词齐全
4. **风格统一**：所有英文 prompt 必须以 "${stylePrompt}" 开头作为风格基调
5. **推荐封面**：从 N 张中挑一张最能代表整个梦的作为封面
6. **生成标题**：4-8 字，提取梦的核心意象

**只输出 JSON，不要任何其他文字。** 格式：

\`\`\`json
{
  "title": "村镇逃亡与飞行",
  "emotions": ["恐惧", "紧张"],
  "mode": "continuous",
  "style_label": "${styleLabel}",
  "scenes": [
    {
      "index": 1,
      "description_zh": "黑白线稿。破败村镇的剪影从远处推进——歪斜的屋脊、断墙、一条狭窄的土路。你和家人小小的几个剪影站在画面正中。",
      "prompt_en": "${stylePrompt}, a ramshackle village with crooked rooftops and broken walls in distance, narrow dirt road, small silhouettes of a family standing in foreground, heavy negative space, dreamlike emptiness, dramatic composition"
    }
  ],
  "cover_index": 5
}
\`\`\``;

  const user = `**梦境内容**：
${req.content}

**情绪感受**：
${req.emotion || "（用户未填，根据内容推断）"}

**画风偏好**：${styleLabel}（${styleKey === "auto" ? "请根据情绪自动选择最契合的画风" : "已锁定"}）

请按上面的 JSON 格式输出分镜剧本。`;

  return { system, user };
}

/**
 * 修订 prompt：用户对已有图集提出修改时
 */
export function buildRevisionPrompt(
  currentScenes: Array<{ index: number; description_zh: string; prompt_en: string }>,
  userRequest: string,
  styleKey: string = "watercolor"
): { system: string; user: string } {
  const stylePrompt =
    STYLE_PROMPTS[styleKey] || STYLE_PROMPTS.watercolor;

  const system = `你是 Dream Keeper 的画师。用户已经看过初版图集，现在提出修改请求。

**重要规则：**
- 严格只改用户提到的部分，不要主动改其他画面
- 保持风格基调："${stylePrompt}"
- 用户可能要求：改某张、删某张、加新张、整体改风格、整套重画
- 输出**变更操作**，不要重复输出未改的画面

**只输出 JSON：**

\`\`\`json
{
  "operations": [
    {
      "action": "update",
      "index": 2,
      "description_zh": "...",
      "prompt_en": "..."
    },
    {
      "action": "delete",
      "index": 3
    },
    {
      "action": "add",
      "after_index": 4,
      "description_zh": "...",
      "prompt_en": "..."
    }
  ],
  "summary_zh": "我把画面 2 改得更暗了，加了一层雾。"
}
\`\`\`

action 可以是 "update" / "delete" / "add"。
- update: 改第 index 张
- delete: 删第 index 张（删完会自动重新编号）
- add: 在第 after_index 张之后插入一张新的`;

  const user = `**当前图集：**

${currentScenes
  .map(
    (s) =>
      `画面 ${s.index}：${s.description_zh}\nEN: ${s.prompt_en}`
  )
  .join("\n\n")}

**用户的修改请求：**
${userRequest}

请按 JSON 格式给出修改方案。`;

  return { system, user };
}

/**
 * 生成分享文案
 */
export function buildShareCaptionPrompt(dream: {
  title: string;
  content: string;
  emotion: string;
  emotions: string[];
}): { system: string; user: string } {
  const system = `你是 Dream Keeper 的文案。给用户的梦写一段 3-5 行的诗意短文，作为分享配文。
- 第一人称
- 不要解读，只复述意境
- 留一点克制的情绪
- 末尾不要加表情符号

**只输出文案本身，不要任何说明。**`;

  const user = `**标题**：${dream.title}
**梦境**：${dream.content}
**情绪原话**：${dream.emotion}
**归类情绪**：${dream.emotions.join(" + ")}

请写分享文案。`;

  return { system, user };
}
