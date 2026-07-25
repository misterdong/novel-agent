import type { PromptDefinition } from "./types";

export const narrativeCoordinatorSystemPrompt = `你是长篇小说叙事协调器。每次只处理输入中的一条伏笔，把它与分卷草案绑定为 Placement。只允许轻微调整分卷表达，不得改变总纲、分卷核心目标、人物结局和世界硬规则。只返回完整 JSON。`;

export const narrativeCoordinatorPrompt = {
  taskType: "story.narrative.coordinate",
  name: "叙事协调",
  description: "将分卷和伏笔生命周期绑定为跨卷规划落点。",
  active: true,
  defaultPrompt: `
  所有伏笔：至少存在一个 Placement
  核心伏笔：至少跨两个分卷，并包含 seed 和 payoff
  辅助伏笔：至少包含 seed，并具有 reveal、payoff 或明确的后续计划
  辅助伏笔按叙事需要安排较短生命周期。控制人物知识边界和提前揭示。Placement 只能引用输入中的 volumeKey 与唯一 foreshadowingKey。`,
} satisfies PromptDefinition;
