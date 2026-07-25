import { getAiRuntimeConfig } from "./config";
import { mockProvider } from "./mock-provider";
import { createOpenAiCompatibleProvider } from "./openai-compatible-provider";

export function getAiProvider() {
  const config = getAiRuntimeConfig();
  // 未配置或主动禁用模型时使用确定性的 Mock，保证本地仍可验证完整流程。
  return config ? createOpenAiCompatibleProvider(config) : mockProvider;
}
