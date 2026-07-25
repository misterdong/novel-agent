import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const projectStatus = pgEnum("project_status", ["active", "archived", "trashed"]);
export const chapterStatus = pgEnum("chapter_status", ["draft", "confirmed", "writing", "completed"]);
export const generationStatus = pgEnum("generation_status", ["queued", "running", "completed", "failed", "cancelled"]);
export const entryStrength = pgEnum("entry_strength", ["soft", "hard"]);
export const sceneStatus = pgEnum("scene_status", ["draft", "confirmed", "writing", "completed"]);
export const proposalStatus = pgEnum("proposal_status", ["pending", "accepted", "rejected", "superseded"]);
export const issueSeverity = pgEnum("issue_severity", ["error", "warning", "suggestion"]);
export const issueStatus = pgEnum("issue_status", ["open", "fixed", "ignored", "false_positive"]);
export const foreshadowingStatus = pgEnum("foreshadowing_status", ["planned", "active", "revealed", "paid_off", "abandoned"]);
export const foreshadowingPlacementStatus = pgEnum("foreshadowing_placement_status", ["planned", "assigned", "written", "verified", "cancelled"]);
export const knowledgeState = pgEnum("knowledge_state", ["knows", "believes", "suspects", "does_not_know"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  genre: varchar("genre", { length: 100 }).notNull(),
  status: projectStatus("status").default("active").notNull(),
  targetWords: integer("target_words").default(500000).notNull(),
  targetChapters: integer("target_chapters").default(200).notNull(),
  narrativePov: varchar("narrative_pov", { length: 50 }).default("第三人称限知").notNull(),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
});

// 长篇小说只保存当前有效的滚动规划周期。每次重规划都会生成一个新周期，
// 后续查询以最新已确认周期为准，不再把旧版“全书一次性规划”当作兼容输入。
export const planningCycles = pgTable("planning_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  cycleNumber: integer("cycle_number").notNull(),
  triggerType: varchar("trigger_type", { length: 40 }).default("manual").notNull(),
  status: varchar("status", { length: 30 }).default("draft").notNull(),
  currentStage: varchar("current_stage", { length: 50 }).default("planning").notNull(),
  planningHorizon: jsonb("planning_horizon").$type<Record<string, unknown>>().default({ detailedVolumes: 1, previewVolumes: 1, detailedChapters: 5 }).notNull(),
  inputSnapshot: jsonb("input_snapshot").$type<Record<string, unknown>>().default({}).notNull(),
  outputSummary: jsonb("output_summary").$type<Record<string, unknown>>().default({}).notNull(),
  validationResult: jsonb("validation_result").$type<Record<string, unknown>>().default({}).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex("planning_cycles_project_number_idx").on(table.projectId, table.cycleNumber)]);

export const storyArcs = pgTable("story_arcs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  planningCycleId: uuid("planning_cycle_id").references(() => planningCycles.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  objective: text("objective").default("").notNull(),
  centralConflict: text("central_conflict").default("").notNull(),
  entryState: jsonb("entry_state").$type<Record<string, unknown>>().default({}).notNull(),
  exitState: jsonb("exit_state").$type<Record<string, unknown>>().default({}).notNull(),
  endingDirection: text("ending_direction").default("").notNull(),
  futureDirections: jsonb("future_directions").$type<string[]>().default([]).notNull(),
  status: varchar("status", { length: 30 }).default("active").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("story_arcs_cycle_position_idx").on(table.planningCycleId, table.position)]);

// 周期输入快照记录“已经发生的事实”和当前承诺，候选方向则留在规划输出中。
// 这样下一轮只读取最新状态，不需要重复向模型发送全书历史正文。
export const storyStateSnapshots = pgTable("story_state_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  planningCycleId: uuid("planning_cycle_id").references(() => planningCycles.id, { onDelete: "cascade" }).notNull(),
  snapshotType: varchar("snapshot_type", { length: 40 }).default("cycle_start").notNull(),
  characterStates: jsonb("character_states").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  relationshipStates: jsonb("relationship_states").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  worldState: jsonb("world_state").$type<Record<string, unknown>>().default({}).notNull(),
  storylineStates: jsonb("storyline_states").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  foreshadowingStates: jsonb("foreshadowing_states").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  knowledgeStates: jsonb("knowledge_states").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  resourceStates: jsonb("resource_states").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  unresolvedConflicts: jsonb("unresolved_conflicts").$type<string[]>().default([]).notNull(),
  readerPromises: jsonb("reader_promises").$type<string[]>().default([]).notNull(),
  recentEvents: jsonb("recent_events").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const volumes = pgTable("volumes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  planningCycleId: uuid("planning_cycle_id").references(() => planningCycles.id, { onDelete: "set null" }),
  storyArcId: uuid("story_arc_id").references(() => storyArcs.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  position: integer("position").notNull(),
  objective: text("objective").default("").notNull(),
  conflict: text("conflict").default("").notNull(),
  turningPoint: text("turning_point").default("").notNull(),
  endingHook: text("ending_hook").default("").notNull(),
  planningStatus: varchar("planning_status", { length: 30 }).default("confirmed").notNull(),
  confidence: integer("confidence").default(70).notNull(),
  lockedFields: jsonb("locked_fields").$type<string[]>().default([]).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("volumes_project_position_idx").on(table.projectId, table.position)]);

export const chapters = pgTable("chapters", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  volumeId: uuid("volume_id").references(() => volumes.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  status: chapterStatus("status").default("draft").notNull(),
  outline: jsonb("outline").$type<Record<string, unknown>>().default({}).notNull(),
  targetWords: integer("target_words").default(3000).notNull(),
  currentWords: integer("current_words").default(0).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("chapters_volume_position_idx").on(table.volumeId, table.position)]);

export const manuscriptVersions = pgTable("manuscript_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }).notNull(),
  versionNo: integer("version_no").notNull(),
  contentJson: jsonb("content_json").$type<Record<string, unknown>>().default({}).notNull(),
  contentText: text("content_text").default("").notNull(),
  wordCount: integer("word_count").default(0).notNull(),
  sourceType: varchar("source_type", { length: 30 }).default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("manuscript_chapter_version_idx").on(table.chapterId, table.versionNo)]);

export const generationRuns = pgTable("generation_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }),
  taskType: varchar("task_type", { length: 80 }).notNull(),
  status: generationStatus("status").default("queued").notNull(),
  userInstruction: text("user_instruction").default("").notNull(),
  inputManifest: jsonb("input_manifest").$type<Record<string, unknown>>().default({}).notNull(),
  parsedOutput: jsonb("parsed_output").$type<Record<string, unknown>>(),
  ...timestamps,
});

export const storyBibleEntries = pgTable("story_bible_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  entryType: varchar("entry_type", { length: 40 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  summary: text("summary").default("").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().default({}).notNull(),
  strength: entryStrength("strength").default("soft").notNull(),
  sourceType: varchar("source_type", { length: 30 }).default("user").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("story_bible_project_type_name_idx").on(table.projectId, table.entryType, table.name)]);

export const characters = pgTable("characters", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  aliases: jsonb("aliases").$type<string[]>().default([]).notNull(),
  profile: jsonb("profile").$type<Record<string, unknown>>().default({}).notNull(),
  coreDesire: text("core_desire").default("").notNull(),
  externalGoal: text("external_goal").default("").notNull(),
  internalNeed: text("internal_need").default("").notNull(),
  behaviorConstraints: jsonb("behavior_constraints").$type<string[]>().default([]).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("characters_project_name_idx").on(table.projectId, table.name)]);

export const characterRelationships = pgTable("character_relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  characterAId: uuid("character_a_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
  characterBId: uuid("character_b_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
  relationType: varchar("relation_type", { length: 60 }).default("acquaintance").notNull(),
  status: varchar("status", { length: 60 }).default("neutral").notNull(),
  aToBAttitude: text("a_to_b_attitude").default("").notNull(),
  bToAAttitude: text("b_to_a_attitude").default("").notNull(),
  description: text("description").default("").notNull(),
  nextDirection: text("next_direction").default("").notNull(),
  firstChapterId: uuid("first_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  lastChangedChapterId: uuid("last_changed_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("character_relationship_pair_idx").on(table.projectId, table.characterAId, table.characterBId)]);

export const characterRelationshipChanges = pgTable("character_relationship_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  relationshipId: uuid("relationship_id").references(() => characterRelationships.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  previousStatus: varchar("previous_status", { length: 60 }).default("").notNull(),
  newStatus: varchar("new_status", { length: 60 }).default("").notNull(),
  description: text("description").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// 剧情道具只记录对作者有管理价值的物品。普通场景陈设保留在正文中，
// 这里只追踪会改变事件结果、承载线索、跨章节复用或参与伏笔的物品。
export const storyItems = pgTable("story_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  itemType: varchar("item_type", { length: 50 }).default("plot").notNull(),
  description: text("description").default("").notNull(),
  holderCharacterId: uuid("holder_character_id").references(() => characters.id, { onDelete: "set null" }),
  currentLocation: varchar("current_location", { length: 200 }).default("").notNull(),
  status: varchar("status", { length: 40 }).default("intact").notNull(),
  storyFunction: text("story_function").default("").notNull(),
  nextPlan: text("next_plan").default("").notNull(),
  relatedCharacterIds: jsonb("related_character_ids").$type<string[]>().default([]).notNull(),
  relatedForeshadowingIds: jsonb("related_foreshadowing_ids").$type<string[]>().default([]).notNull(),
  firstChapterId: uuid("first_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  lastChangedChapterId: uuid("last_changed_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  importance: integer("importance").default(3).notNull(),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("story_items_project_name_idx").on(table.projectId, table.name)]);

export const storyItemChanges = pgTable("story_item_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: uuid("item_id").references(() => storyItems.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  changeType: varchar("change_type", { length: 40 }).default("updated").notNull(),
  description: text("description").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const scenes = pgTable("scenes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  status: sceneStatus("status").default("draft").notNull(),
  outline: jsonb("outline").$type<Record<string, unknown>>().default({}).notNull(),
  targetWords: integer("target_words").default(1000).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("scenes_chapter_position_idx").on(table.chapterId, table.position)]);

export const chapterSummaries = pgTable("chapter_summaries", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }).notNull(),
  manuscriptVersionId: uuid("manuscript_version_id").references(() => manuscriptVersions.id, { onDelete: "cascade" }).notNull(),
  shortSummary: text("short_summary").notNull(),
  detailedSummary: text("detailed_summary").notNull(),
  openQuestions: jsonb("open_questions").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("chapter_summaries_version_idx").on(table.manuscriptVersionId)]);

export const stateChangeProposals = pgTable("state_change_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }).notNull(),
  manuscriptVersionId: uuid("manuscript_version_id").references(() => manuscriptVersions.id, { onDelete: "cascade" }).notNull(),
  proposalType: varchar("proposal_type", { length: 40 }).notNull(),
  predicate: varchar("predicate", { length: 80 }).notNull(),
  newValue: jsonb("new_value").$type<Record<string, unknown>>().notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
  status: proposalStatus("status").default("pending").notNull(),
  ...timestamps,
});

export const storyFacts = pgTable("story_facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  sourceChapterId: uuid("source_chapter_id").references(() => chapters.id, { onDelete: "cascade" }).notNull(),
  predicate: varchar("predicate", { length: 80 }).notNull(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  sourceProposalId: uuid("source_proposal_id").references(() => stateChangeProposals.id, { onDelete: "restrict" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reviewIssues = pgTable("review_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }).notNull(),
  manuscriptVersionId: uuid("manuscript_version_id").references(() => manuscriptVersions.id, { onDelete: "cascade" }).notNull(),
  reviewType: varchar("review_type", { length: 40 }).notNull(),
  severity: issueSeverity("severity").notNull(),
  status: issueStatus("status").default("open").notNull(),
  code: varchar("code", { length: 80 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  explanation: text("explanation").notNull(),
  location: jsonb("location").$type<Record<string, unknown>>().default({}).notNull(),
  evidence: jsonb("evidence").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  suggestions: jsonb("suggestions").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  ...timestamps,
});

export const foreshadowings = pgTable("foreshadowings", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  truth: text("truth").default("").notNull(),
  hiddenInformation: jsonb("hidden_information").$type<string[]>().default([]).notNull(),
  purpose: text("purpose").default("").notNull(),
  importance: varchar("importance", { length: 20 }).default("supporting").notNull(),
  revealPattern: varchar("reveal_pattern", { length: 40 }).default("progressive").notNull(),
  commitmentLevel: varchar("commitment_level", { length: 30 }).default("candidate").notNull(),
  targetPayoffStage: varchar("target_payoff_stage", { length: 120 }).default("").notNull(),
  earliestRevealStage: varchar("earliest_reveal_stage", { length: 120 }).default("").notNull(),
  latestPayoffStage: varchar("latest_payoff_stage", { length: 120 }).default("").notNull(),
  planningNotes: text("planning_notes").default("").notNull(),
  status: foreshadowingStatus("status").default("planned").notNull(),
  ...timestamps,
});

export const foreshadowingPlacements = pgTable("foreshadowing_placements", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  planningCycleId: uuid("planning_cycle_id").references(() => planningCycles.id, { onDelete: "cascade" }),
  foreshadowingId: uuid("foreshadowing_id").references(() => foreshadowings.id, { onDelete: "cascade" }).notNull(),
  volumeId: uuid("volume_id").references(() => volumes.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
  placementType: varchar("placement_type", { length: 30 }).notNull(),
  required: boolean("required").default(false).notNull(),
  narrativeIntent: text("narrative_intent").default("").notNull(),
  allowedInformation: jsonb("allowed_information").$type<Record<string, unknown>>().default({}).notNull(),
  forbiddenInformation: jsonb("forbidden_information").$type<Record<string, unknown>>().default({}).notNull(),
  status: foreshadowingPlacementStatus("status").default("planned").notNull(),
  planningStatus: varchar("planning_status", { length: 30 }).default("candidate").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("foreshadowing_placements_thread_position_idx").on(table.foreshadowingId, table.position)]);

export const foreshadowingOccurrences = pgTable("foreshadowing_occurrences", {
  id: uuid("id").defaultRandom().primaryKey(),
  foreshadowingId: uuid("foreshadowing_id").references(() => foreshadowings.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "cascade" }).notNull(),
  sceneId: uuid("scene_id").references(() => scenes.id, { onDelete: "set null" }),
  placementId: uuid("placement_id").references(() => foreshadowingPlacements.id, { onDelete: "set null" }),
  action: varchar("action", { length: 30 }).notNull(),
  description: text("description").default("").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const timelineEvents = pgTable("timeline_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").default("").notNull(),
  timeKind: varchar("time_kind", { length: 30 }).default("relative").notNull(),
  relativeDay: integer("relative_day"),
  locationName: varchar("location_name", { length: 200 }).default("").notNull(),
  ...timestamps,
});

export const characterKnowledge = pgTable("character_knowledge", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  characterId: uuid("character_id").references(() => characters.id, { onDelete: "cascade" }).notNull(),
  proposition: text("proposition").notNull(),
  state: knowledgeState("state").notNull(),
  sourceChapterId: uuid("source_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  active: boolean("active").default(true).notNull(),
  ...timestamps,
});

export const promptTemplates = pgTable("prompt_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  taskType: varchar("task_type", { length: 80 }).notNull(),
  customPrompt: text("custom_prompt").default("").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("prompt_templates_project_task_idx").on(table.projectId, table.taskType)]);

export const storylines = pgTable("storylines", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  storylineType: varchar("storyline_type", { length: 40 }).default("main").notNull(),
  summary: text("summary").default("").notNull(),
  coreQuestion: text("core_question").default("").notNull(),
  initialState: text("initial_state").default("").notNull(),
  targetOutcome: text("target_outcome").default("").notNull(),
  coreConflict: text("core_conflict").default("").notNull(),
  currentProgress: text("current_progress").default("").notNull(),
  nextPlan: text("next_plan").default("").notNull(),
  completionCriteria: text("completion_criteria").default("").notNull(),
  priority: varchar("priority", { length: 20 }).default("important").notNull(),
  startVolumeId: uuid("start_volume_id").references(() => volumes.id, { onDelete: "set null" }),
  endVolumeId: uuid("end_volume_id").references(() => volumes.id, { onDelete: "set null" }),
  relatedCharacterIds: jsonb("related_character_ids").$type<string[]>().default([]).notNull(),
  status: varchar("status", { length: 30 }).default("planned").notNull(),
  narrativeStatus: varchar("narrative_status", { length: 30 }).default("candidate").notNull(),
  position: integer("position").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("storylines_project_position_idx").on(table.projectId, table.position)]);

export const storylineNodes = pgTable("storyline_nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  storylineId: uuid("storyline_id").references(() => storylines.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  objective: text("objective").default("").notNull(),
  entryCondition: text("entry_condition").default("").notNull(),
  result: text("result").default("").notNull(),
  status: varchar("status", { length: 30 }).default("planned").notNull(),
  narrativeStatus: varchar("narrative_status", { length: 30 }).default("candidate").notNull(),
  position: integer("position").notNull(),
  plannedVolumeId: uuid("planned_volume_id").references(() => volumes.id, { onDelete: "set null" }),
  plannedChapterId: uuid("planned_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  actualChapterId: uuid("actual_chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  participantCharacterIds: jsonb("participant_character_ids").$type<string[]>().default([]).notNull(),
  stateChanges: jsonb("state_changes").$type<Record<string, unknown>>().default({}).notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("storyline_nodes_line_position_idx").on(table.storylineId, table.position)]);

export const plotEvents = pgTable("plot_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  storylineId: uuid("storyline_id").references(() => storylines.id, { onDelete: "set null" }),
  volumeId: uuid("volume_id").references(() => volumes.id, { onDelete: "set null" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description").default("").notNull(),
  cause: text("cause").default("").notNull(),
  consequence: text("consequence").default("").notNull(),
  position: integer("position").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("plot_events_project_position_idx").on(table.projectId, table.position)]);

export const autopilotRuns = pgTable("autopilot_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  status: varchar("status", { length: 40 }).default("queued").notNull(),
  scope: varchar("scope", { length: 30 }).default("chapter").notNull(),
  instruction: text("instruction").default("").notNull(),
  targetWords: integer("target_words").default(3000).notNull(),
  currentStage: varchar("current_stage", { length: 50 }).default("queued").notNull(),
  currentSceneIndex: integer("current_scene_index").default(0).notNull(),
  repairCount: integer("repair_count").default(0).notNull(),
  maxRepairs: integer("max_repairs").default(2).notNull(),
  progress: integer("progress").default(0).notNull(),
  lastMessage: text("last_message").default("").notNull(),
  errorMessage: text("error_message").default("").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().default({}).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
});

export const autopilotEvents = pgTable("autopilot_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  runId: uuid("run_id").references(() => autopilotRuns.id, { onDelete: "cascade" }).notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  stage: varchar("stage", { length: 50 }).notNull(),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  level: varchar("level", { length: 20 }).default("info").notNull(),
  message: text("message").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
  provider: varchar("provider", { length: 80 }).default("").notNull(),
  model: varchar("model", { length: 160 }).default("").notNull(),
  durationMs: integer("duration_ms").default(0).notNull(),
  promptTokens: integer("prompt_tokens").default(0).notNull(),
  completionTokens: integer("completion_tokens").default(0).notNull(),
  estimatedCostMicros: integer("estimated_cost_micros").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
