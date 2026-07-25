import type { PromptDefinition } from "./types";

export const localRewriterPrompt = {
  taskType: "rewrite.local",
  name: "局部改写",
  description: "在保持剧情事实不变的前提下改写选定文本。",
  active: false,
  defaultPrompt: "仅改写指定范围，保持人物、时间、地点和剧情结果不变，返回修改后的正文及简短变更说明。",
} satisfies PromptDefinition;
