import type { PromptDefinition } from "./types";

export const chapterSummarizerPrompt = {
  taskType: "chapter.summary",
  name: "章节摘要",
  description: "提炼章节摘要、未解决问题和关键事件。",
  active: false,
  defaultPrompt: "提炼短摘要、详细摘要和未解决问题；只依据正文，不补充正文中不存在的事实。",
} satisfies PromptDefinition;
