/**
 * 京东云 AI 平台 — Claude / GPT 通用对话调用
 *
 * 支持：Claude-sonnet-4, gpt-4o 等
 * endpoint: http://ai-api.jdcloud.com/v1/chat/completions
 * 认证：Bearer {JDCLOUD_AI_API_KEY}
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

const DEFAULT_MODEL = "JoyAI-LLM-1.3T";

export async function callChat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const apiKey = process.env.JDCLOUD_AI_API_KEY;
  const apiBase =
    process.env.JDCLOUD_AI_API_URL || "http://ai-api.jdcloud.com";

  if (!apiKey) {
    throw new Error("JDCLOUD_AI_API_KEY not configured");
  }

  const model = options.model || DEFAULT_MODEL;
  const isClaude = model.toLowerCase().includes("claude");

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options.maxTokens ?? 4000,
    stream: false,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  // Claude 模型走 Bedrock 透传，需要额外字段
  if (isClaude) {
    body.anthropic_version = "bedrock-2023-05-31";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (isClaude) {
    headers.RawResponse = "1";
  }

  const res = await fetch(`${apiBase}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Chat API error ${res.status}: ${errText.slice(0, 500)}`
    );
  }

  const data = await res.json();

  // 兼容两种返回结构：
  // 1) OpenAI 格式：data.choices[0].message.content
  // 2) Bedrock 透传 Claude 格式：data.content[0].text
  let content: string | undefined;
  if (data.choices?.[0]?.message?.content) {
    content = data.choices[0].message.content;
  } else if (Array.isArray(data.content)) {
    content = data.content
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");
  } else if (typeof data.content === "string") {
    content = data.content;
  }

  if (!content) {
    throw new Error(
      `Unexpected response shape: ${JSON.stringify(data).slice(0, 500)}`
    );
  }

  return content;
}

/**
 * 让 Claude 返回 JSON 时用——自动从回复中提取 JSON 部分。
 * Claude 经常会用 ```json ... ``` 包起来，或前后带说明文字，需要清洗。
 */
export function extractJson<T = unknown>(text: string): T {
  // 优先匹配 ```json ... ``` 代码块
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim()) as T;
  }
  // 否则找第一个 { 到最后一个 }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1)) as T;
  }
  throw new Error("Could not extract JSON from response");
}
