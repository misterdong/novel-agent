import type { PromptDefinition } from "./types";

export const chapterPlannerPrompt = {
  taskType: "autopilot.chapter.plan",
  name: "自动章节规划",
  description: "依据总纲、分卷和前序状态自动规划下一章及场景。",
  active: true,
  defaultPrompt: "规划紧接前文的下一章，确保目标、冲突、结果和结尾钩子形成因果闭环，并拆分为可独立执行的场景。",
} satisfies PromptDefinition;
