import type { PromptDefinition } from "./types";

export const continuityReviewerPrompt = {
  taskType: "review.continuity",
  name: "一致性检查",
  description: "检查正文与硬性设定、人物状态和时间线的冲突。",
  active: true,
  defaultPrompt: "逐项检查正文与正式事实的冲突，并检查章节目标、冲突、结果和钩子的完成情况。给出严重度、原文证据和最小可执行建议；不要把人物认知当作客观事实。",
} satisfies PromptDefinition;
