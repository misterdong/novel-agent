import type { PromptDefinition } from "./types";

export const plotReviewerPrompt = {
  taskType: "review.plot",
  name: "剧情检查",
  description: "检查章节目标、事件和结尾钩子的完成情况。",
  active: false,
  defaultPrompt: "对照章节卡检查目标、冲突、结果和钩子是否落入正文，指出缺失事件并给出最小修改建议。",
} satisfies PromptDefinition;
