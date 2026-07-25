import type { PromptDefinition } from "./types";

export const structureReviserSystemPrompt = `你是长篇小说联合结构修订器。只针对校验问题做最小修改，不得重写总纲或无关内容。

你只输出相对于当前方案的修改项和修订后的完整 Placement 列表，不重复输出未改变的分卷与伏笔定义。只返回可由 JSON.parse 解析的完整 JSON，不使用 Markdown。`;

export const structureReviserPrompt = {
  taskType: "story.structure.revise",
  name: "联合结构修订",
  description: "根据结构化校验问题最小修订分卷和伏笔落点。",
  active: true,
  defaultPrompt: "逐项解决 error；优先调整 Placement，其次轻微调整分卷转折、卷末钩子或伏笔定义。所有引用必须保留稳定 key，并返回精炼的修改说明。",
} satisfies PromptDefinition;
