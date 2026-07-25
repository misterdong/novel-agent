import type { PromptDefinition } from "./types";

export const storyPlanPrompt = {
  taskType: "story.plan",
  name: "故事总纲",
  description: "从核心创意生成开篇设计、核心爽点、长期悬念、主题、冲突、人物弧和分卷方向。",
  active: true,
  defaultPrompt: "生成适合中文长篇小说的结构化总纲。保持因果链清晰，明确开篇事件、开篇钩子、初始目标、可持续兑现的核心爽点、跨阶段长期悬念，并为主题、主角弧、核心冲突、结局方向和分卷规划分别提供具体内容。",
} satisfies PromptDefinition;
