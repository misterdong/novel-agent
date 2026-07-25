import { chapterPlannerPrompt } from "./prompts/chapter-planner";
import { chapterSummarizerPrompt } from "./prompts/chapter-summarizer";
import { characterGeneratorPrompt } from "./prompts/character-generator";
import { continuityReviewerPrompt } from "./prompts/continuity-reviewer";
import { localRewriterPrompt } from "./prompts/local-rewriter";
import { narrativeCoordinatorPrompt } from "./prompts/narrative-coordinator";
import { plotReviewerPrompt } from "./prompts/plot-reviewer";
import { sceneWriterPrompt } from "./prompts/scene-writer";
import { stateExtractorPrompt } from "./prompts/state-extractor";
import { structureReviserPrompt } from "./prompts/structure-reviser";
import { structureValidatorPrompt } from "./prompts/structure-validator";
import { foreshadowPlannerPrompt } from "./prompts/foreshadow-planner";
import { storyBiblePrompt } from "./prompts/story-bible";
import { storyPlanPrompt } from "./prompts/story-plan";
import { storylineGeneratorPrompt } from "./prompts/storyline-generator";
import { volumePlanPrompt } from "./prompts/volume-plan";
import { rollingStructurePlannerPrompt } from "./prompts/rolling-structure-planner";
import type { PromptDefinition } from "./prompts/types";

// 此文件只维护提示词注册顺序；具体角色提示词分别放在 prompts 目录中。
export const promptCatalog: readonly PromptDefinition[] = [
  storyPlanPrompt,
  storylineGeneratorPrompt,
  volumePlanPrompt,
  rollingStructurePlannerPrompt,
  foreshadowPlannerPrompt,
  narrativeCoordinatorPrompt,
  structureValidatorPrompt,
  structureReviserPrompt,
  storyBiblePrompt,
  characterGeneratorPrompt,
  chapterPlannerPrompt,
  sceneWriterPrompt,
  chapterSummarizerPrompt,
  stateExtractorPrompt,
  continuityReviewerPrompt,
  plotReviewerPrompt,
  localRewriterPrompt,
];

export function getDefaultPrompt(taskType: string) {
  return promptCatalog.find((item) => item.taskType === taskType)?.defaultPrompt ?? "";
}
