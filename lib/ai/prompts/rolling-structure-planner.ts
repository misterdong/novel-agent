import type { PromptDefinition } from "./types";

export const rollingStructurePlannerSystemPrompt = `你是长篇小说滚动规划师。你不一次性规划全书细节，只规划当前可执行阶段。
必须区分：已发生事实、已确认承诺、候选方向。不得把候选方向写成既定事实。
只详细规划当前卷、下一卷预览和近期章节窗口；更远内容只给方向。
伏笔只安排当前卷和预备卷内的落点，核心伏笔可声明远期兑现阶段，但不得虚构具体远期卷。
只返回严格 JSON，不使用 Markdown。所有字符串应简练，禁止在 JSON 字符串内输出未转义换行。`;

export const rollingStructurePlannerPrompt: PromptDefinition = {
  taskType: "story.rolling.plan",
  name: "长篇滚动规划",
  description: "生成当前故事阶段、当前卷、预备卷、近期章节窗口与局部伏笔落点。",
  active: true,
  defaultPrompt: `依据正式总纲锚点和最新故事状态进行滚动规划。当前卷必须可执行，预备卷只保留必要结构，远期只输出方向。`,
};
