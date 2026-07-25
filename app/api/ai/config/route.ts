import { NextResponse } from "next/server";
import { getAiRuntimeConfig, getPublicAiConfig } from "@/lib/ai/config";
import { testOpenAiCompatibleConnection } from "@/lib/ai/openai-compatible-provider";

export async function GET() {
  // This endpoint intentionally returns only a boolean for the key; credentials
  // must never cross the server/browser boundary.
  return NextResponse.json(getPublicAiConfig());
}

export async function POST() {
  const config = getAiRuntimeConfig();
  if (!config) return NextResponse.json({ ok: false, error: "模型配置不完整，请检查 .env 后重启服务。" }, { status: 400 });
  try {
    const reply = await testOpenAiCompatibleConnection(config);
    return NextResponse.json({ ok: true, provider: config.provider, model: config.model, reply });
  } catch (error) {
    // Provider errors are returned without headers or request bodies, preventing
    // accidental credential disclosure while keeping diagnostics actionable.
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "连接测试失败" }, { status: 502 });
  }
}
