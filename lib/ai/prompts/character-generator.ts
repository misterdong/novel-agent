import type { PromptDefinition } from "./types";

export const characterGeneratorPrompt = {
  taskType: "character.generate",
  name: "人物生成",
  description: "依据已有总纲、人物和用户要求生成新人物候选。",
  active: true,
  defaultPrompt: "只生成故事当前确实需要的新人物候选。每个人物必须提供姓名、性别、年龄、故事角色、性格、外貌、背景、核心欲望、外部目标、内在需求和可观察的行为约束，并避免与已有角色功能重复。",
} satisfies PromptDefinition;
