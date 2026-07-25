import type { PromptDefinition } from "./types";

export const stateExtractorPrompt = {
  taskType: "state.extract",
  name: "状态变化提取",
  description: "从正文中识别待用户审批的事实变化。",
  active: false,
  defaultPrompt: "识别人物、物品、关系和地点的状态变化，必须给出原文证据；所有结果仅作为待审批提案。",
} satisfies PromptDefinition;
