import type { PromptDefinition } from "./types";

export const structureValidatorSystemPrompt = `你是长篇小说联合结构校验器。只依据输入检查分卷、伏笔和 Placement 的一致性，不创作新方案。只返回完整 JSON。`;

export const structureValidatorPrompt = {
  taskType: "story.structure.validate",
  name: "联合结构校验",
  description: "检查卷间因果、核心伏笔覆盖、提前揭示和知识边界。",
  active: true,
  defaultPrompt: "检查卷间因果、核心伏笔是否跨卷且包含 seed/payoff、生命周期顺序、伏笔密度、提前揭示、人物知识边界、冗余伏笔和结局支撑。error 存在时 passed 必须为 false。",
} satisfies PromptDefinition;
