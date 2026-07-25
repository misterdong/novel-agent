export type AiRuntimeConfig = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
};

export function getAiRuntimeConfig(): AiRuntimeConfig | null {
  const provider = process.env.AI_PROVIDER?.trim() || "mock";
  if (provider === "mock") return null;
  const model = process.env.AI_MODEL?.trim();
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  if (!model || !apiKey) return null;
  return { provider, model, apiKey, baseUrl: baseUrl.replace(/\/$/, "") };
}

export function getPublicAiConfig() {
  const rawProvider = process.env.AI_PROVIDER?.trim() || "mock";
  const config = getAiRuntimeConfig();
  return {
    provider: config?.provider ?? rawProvider,
    model: config?.model ?? process.env.AI_MODEL?.trim() ?? "Mock Provider",
    baseUrl: config?.baseUrl ?? process.env.OPENAI_BASE_URL?.trim() ?? "",
    configured: rawProvider === "mock" || Boolean(config),
    usingMock: !config,
    hasApiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
  };
}
