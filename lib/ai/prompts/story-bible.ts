import type { PromptDefinition } from "./types";

export const storyBiblePrompt = {
  taskType: "story.bible.generate",
  name: "故事圣经生成",
  description: "从故事创意生成候选人物、规则、地点和势力。",
  active: true,
  defaultPrompt: "生成故事圣经候选。人物应具有欲望、外部目标和行为约束；世界规则必须明确边界。不要将候选内容描述成已经确认的事实。",
} satisfies PromptDefinition;
