export type ForeshadowingContextItem = { title: string; purpose: string; status: string; importance: string; truth?: string; hiddenInformation?: string[] };

export type WritingContext = {
  chapterTitle: string;
  chapterOutline: Record<string, unknown>;
  sceneTitle?: string;
  sceneOutline?: Record<string, unknown>;
  hardRules: Array<{ id: string; name: string; summary: string }>;
  characters: Array<{ id: string; name: string; coreDesire: string; externalGoal?: string; internalNeed?: string; behaviorConstraints?: string[]; profile?: Record<string, unknown> }>;
  previousText: string;
  previousChapterEnding?: string;
  foreshadowings?: ForeshadowingContextItem[];
  timeline?: Array<{ title: string; description: string; relativeDay: number | null; locationName: string }>;
  characterKnowledge?: Array<{ characterName: string; proposition: string; state: string }>;
  storyItems?: Array<{ name: string; itemType: string; holderName: string; currentLocation: string; status: string; storyFunction: string; nextPlan: string }>;
  characterRelationships?: Array<{ characterAName: string; characterBName: string; relationType: string; status: string; aToBAttitude: string; bToAAttitude: string; nextDirection: string }>;
  instruction: string;
  defaultPrompt: string;
  customPrompt: string;
};

export type CharacterCandidate = { name: string; gender?: string; age?: string | number; role?: string; personality?: string; appearance?: string; background?: string; occupation?: string; faction?: string; archetype?: string; flaw?: string; fear?: string; secret?: string; arcStart?: string; arcTarget?: string; speechStyle?: string; aliases?: string[]; coreDesire: string; externalGoal: string; internalNeed?: string; behaviorConstraints?: string[] };

export type ReviewFinding = {
  reviewType: "continuity" | "plot";
  severity: "error" | "warning" | "suggestion";
  code: string;
  title: string;
  explanation: string;
  evidence: Array<Record<string, unknown>>;
  suggestions: Array<Record<string, unknown>>;
};

export type ReviewContext = {
  chapterTitle: string;
  chapterOutline: Record<string, unknown>;
  manuscript: string;
  hardRules: Array<{ id: string; name: string; summary: string }>;
  characters: Array<{ id: string; name: string; coreDesire: string; externalGoal: string; internalNeed?: string; behaviorConstraints?: string[]; profile?: Record<string, unknown> }>;
  timeline: Array<{ title: string; description: string; relativeDay: number | null; locationName: string }>;
  characterKnowledge: Array<{ characterName: string; proposition: string; state: string }>;
  defaultPrompt: string;
  customPrompt: string;
  previousChapterEnding?: string;
  foreshadowings?: ForeshadowingContextItem[];
  storyItems?: Array<{ name: string; holderName: string; currentLocation: string; status: string; storyFunction: string }>;
  characterRelationships?: Array<{ characterAName: string; characterBName: string; relationType: string; status: string; aToBAttitude: string; bToAAttitude: string }>;
};

export type ChapterRepairContext = {
  chapterTitle: string;
  chapterOutline: Record<string, unknown>;
  manuscript: string;
  findings: Array<{ title?: string; explanation?: string; suggestions?: Array<Record<string, unknown>> }>;
  hardRules: Array<{ id: string; name: string; summary: string }>;
  characters: Array<{ id: string; name: string; coreDesire: string; externalGoal: string }>;
};

export type ChapterMemoryContext = {
  chapterTitle: string;
  chapterOutline: Record<string, unknown>;
  manuscript: string;
  defaultSummaryPrompt: string;
  customSummaryPrompt: string;
  defaultStatePrompt: string;
  customStatePrompt: string;
  characters: Array<{ id: string; name: string }>;
  existingForeshadowings: Array<{ id: string; title: string; purpose: string; status: string; importance: string; hiddenInformation: string[] }>;
  recentTimeline: Array<{ title: string; description: string; relativeDay: number | null; locationName: string }>;
  existingKnowledge: Array<{ characterName: string; proposition: string; state: string }>;
  existingItems: Array<{ id: string; name: string; itemType: string; holderName: string; currentLocation: string; status: string; storyFunction: string; nextPlan: string }>;
  existingRelationships: Array<{ id: string; characterAName: string; characterBName: string; relationType: string; status: string; aToBAttitude: string; bToAAttitude: string; nextDirection: string }>;
};

export type ChapterMemoryResult = {
  shortSummary: string;
  detailedSummary: string;
  openQuestions: string[];
  proposals: Array<{ proposalType: string; predicate: string; newValue: Record<string, unknown>; evidence: Record<string, unknown> }>;
};

export type ChapterPlanningContext = {
  storyPlan: Record<string, unknown>;
  volume: { title: string; objective: string; conflict: string; turningPoint: string; endingHook: string };
  previousChapters: Array<{ title: string; outline: Record<string, unknown>; summary: string; ending: string }>;
  characters: Array<{ name: string; coreDesire: string; externalGoal: string; internalNeed?: string; behaviorConstraints?: string[]; profile?: Record<string, unknown> }>;
  hardRules: Array<{ name: string; summary: string }>;
  foreshadowings?: ForeshadowingContextItem[];
  timeline?: Array<{ title: string; description: string; relativeDay: number | null; locationName: string }>;
  characterKnowledge?: Array<{ characterName: string; proposition: string; state: string }>;
  storyItems?: Array<{ id: string; name: string; itemType: string; holderName: string; currentLocation: string; status: string; storyFunction: string; nextPlan: string }>;
  characterRelationships?: Array<{ characterAName: string; characterBName: string; relationType: string; status: string; aToBAttitude: string; bToAAttitude: string; nextDirection: string }>;
  storylines?: Array<{ name: string; storylineType: string; priority: string; coreConflict: string; currentProgress: string; nextPlan: string; nextNode: { id: string; title: string; objective: string; entryCondition: string } | null }>;
  targetWords: number;
  instruction: string;
};

export type StructureStoryContext = {
  project: { title: string; genre: string; targetWords: number; targetChapters: number };
  storyPlan: Record<string, unknown>;
  characters: Array<Record<string, unknown>>;
  storylines: Array<Record<string, unknown>>;
  storylineNodes: Array<Record<string, unknown>>;
  hardRules: Array<Record<string, unknown>>;
  instruction: string;
};

export interface AiProvider {
  writeScene(context: WritingContext): Promise<{ prose: string; coveredEvents: string[]; characterCandidates: CharacterCandidate[] }>;
  generateStoryPlan(input: { brief: string; genre: string; targetChapters: number; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  generateVolumePlan(input: { storyPlan: Record<string, unknown>; genre: string; targetChapters: number; instruction: string; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  planRollingStructure(input: { context: StructureStoryContext; horizon: { detailedVolumes: number; previewVolumes: number; detailedChapters: number }; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  planForeshadowings(input: { context: StructureStoryContext; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  coordinateNarrative(input: { context: StructureStoryContext; volumeDraft: Record<string, unknown>; foreshadowingDraft: Record<string, unknown>; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  validateStructure(input: { context: StructureStoryContext; coordinatedPlan: Record<string, unknown>; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  reviseStructure(input: { context: StructureStoryContext; coordinatedPlan: Record<string, unknown>; validation: Record<string, unknown>; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  generateStoryBible(input: { brief: string; genre: string; existingNames: string[]; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  generateStorylines(input: { storyPlan: Record<string, unknown>; existingNames: string[]; defaultPrompt: string; customPrompt: string }): Promise<Record<string, unknown>>;
  refineStoryline(input: { storyPlan: Record<string, unknown>; storyline: Record<string, unknown>; existingNodes: Array<Record<string, unknown>> }): Promise<Record<string, unknown>>;
  reviewChapter(context: ReviewContext): Promise<ReviewFinding[]>;
  repairChapter(context: ChapterRepairContext): Promise<{ prose: string }>;
  extractChapterMemory(context: ChapterMemoryContext): Promise<ChapterMemoryResult>;
  planChapter(context: ChapterPlanningContext): Promise<{ title: string; objective: string; conflict: string; outcome: string; endingHook: string; itemCandidates: Array<{ name: string; storyFunction: string; whyExistingItemsCannotServe: string; expectedDuration: string; relatedCharacters: string[] }>; scenes: Array<{ title: string; objective: string; conflict: string; outcome: string; targetWords: number }> }>;
}
