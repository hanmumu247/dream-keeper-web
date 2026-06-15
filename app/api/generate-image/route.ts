import { NextRequest, NextResponse } from "next/server";

/**
 * 调用京东云 gpt-image-1 生成图片
 *
 * 输入：{ prompt: string, quality?: "high" | "medium" | "low", size?: string }
 * 输出：{ images: string[] }（每张图是 data URL，可直接放进 <img src=>）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, quality = "medium", size = "1024x1024", n = 1 } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.JDCLOUD_AI_API_KEY;
    const apiBase =
      process.env.JDCLOUD_AI_API_URL || "http://ai-api.jdcloud.com";

    if (!apiKey) {
      return NextResponse.json(
        { error: "JDCLOUD_AI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const upstream = await fetch(`${apiBase}/v1/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size,
        quality,
        output_format: "JPEG",
        output_compression: 80,
        n,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error("Upstream error:", upstream.status, errText);
      return NextResponse.json(
        { error: `Upstream error ${upstream.status}`, detail: errText },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();

    // gpt-image-1 返回 { data: [{ b64_json: "..." }] }
    const images: string[] = (data.data || []).map(
      (item: { b64_json: string }) =>
        `data:image/jpeg;base64,${item.b64_json}`
    );

    return NextResponse.json({
      images,
      usage: {
        input_tokens: data.usage?.input_tokens,
        output_tokens: data.usage?.output_tokens,
        total_tokens: data.usage?.total_tokens,
      },
    });
  } catch (err) {
    console.error("generate-image error:", err);
    return NextResponse.json(
      { error: "internal error", detail: String(err) },
      { status: 500 }
    );
  }
}
