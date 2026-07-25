import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chapters, characters, foreshadowings, generationRuns, manuscriptVersions, planningCycles, projects, promptTemplates, scenes, storylineNodes, storylines, storyBibleEntries } from "@/db/schema";
import { getAiProvider } from "./provider-factory";
import { getDefaultPrompt } from "./prompt-catalog";

type GenerationRun = typeof generationRuns.$inferSelect;

function compactStoryPlan(storyPlan: Record<string, unknown>) {
  // Coordinator 只关心跨卷绑定所需的全局方向；正式总纲中的旧分卷和长篇说明不重复传入。
  const keys = ["premise", "centralConflict", "initial_goal", "core_payoff", "long_term_mystery", "protagonistArc", "endingDirection", "worldSummary"];
  return Object.fromEntries(keys.filter((key) => storyPlan[key] != null).map((key) => [key, storyPlan[key]]));
}

function mergeDeterministicValidation(plan: Record<string, unknown>, modelResult: Record<string, unknown>) {
  const volumeRows = Array.isArray(plan.volumes) ? plan.volumes as Array<Record<string, unknown>> : [];
  const threadRows = Array.isArray(plan.foreshadowings) ? plan.foreshadowings as Array<Record<string, unknown>> : [];
  const placementRows = Array.isArray(plan.placements) ? plan.placements as Array<Record<string, unknown>> : [];
  const volumeKeys = new Set(volumeRows.map((item) => String(item.volumeKey ?? "")));
  const threadKeys = new Set(threadRows.map((item) => String(item.key ?? "")));
  const issues: Array<Record<string, unknown>> = [];
  for (const placement of placementRows) {
    if (!volumeKeys.has(String(placement.volumeKey)) || !threadKeys.has(String(placement.foreshadowingKey))) issues.push({ code: "INVALID_PLACEMENT_REFERENCE", severity: "error", message: "Placement 引用了不存在的分卷或伏笔 key。", foreshadowingKey: placement.foreshadowingKey ?? "", affectedVolumeKeys: [placement.volumeKey ?? ""], suggestion: "改为输入草案中存在的稳定 key。" });
  }
  // position 是同一伏笔生命周期内的顺序；核心与辅助伏笔都不能出现重复位置。
  for (const thread of threadRows) {
    const key = String(thread.key ?? "");
    const placements = placementRows.filter((item) => String(item.foreshadowingKey) === key);
    if (!placements.length) issues.push({ code: "FORESHADOWING_WITHOUT_PLACEMENT", severity: "error", message: "伏笔没有绑定任何分卷落点。", foreshadowingKey: key, affectedVolumeKeys: [], suggestion: "手动添加 Placement，或删除不再需要的伏笔。" });
    const positions = placements.map((item) => Number(item.position));
    if (new Set(positions).size !== positions.length) issues.push({ code: "DUPLICATE_PLACEMENT_POSITION", severity: "error", message: "同一伏笔存在重复生命周期顺序。", foreshadowingKey: key, affectedVolumeKeys: [...new Set(placements.map((item) => String(item.volumeKey)))], suggestion: "重新排列 position。" });
  }
  for (const thread of threadRows.filter((item) => item.importance === "core")) {
    const key = String(thread.key ?? ""); const placements = placementRows.filter((item) => String(item.foreshadowingKey) === key);
    const stages = new Set(placements.map((item) => String(item.placementType))); const coveredVolumes = new Set(placements.map((item) => String(item.volumeKey)));
    if (coveredVolumes.size < 2 || !stages.has("seed") || !stages.has("payoff")) issues.push({ code: "CORE_FORESHADOWING_LIFECYCLE", severity: "error", message: "核心伏笔必须跨越至少两个分卷，并包含 seed 与 payoff。", foreshadowingKey: key, affectedVolumeKeys: [...coveredVolumes], suggestion: "补齐跨卷埋设与回收落点。" });
  }
  const modelIssues = Array.isArray(modelResult.issues) ? modelResult.issues as Array<Record<string, unknown>> : [];
  const allIssues = [...modelIssues, ...issues];
  return { ...modelResult, passed: modelResult.passed === true && !allIssues.some((item) => item.severity === "error"), issues: allIssues };
}

async function processStructurePlanning(run: GenerationRun) {
  const [project] = await db.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
  if (!project) throw new Error("项目不存在");
  const [promptRows, people, rules, storylineRows, nodeRows] = await Promise.all([
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, project.id)),
    db.select().from(characters).where(eq(characters.projectId, project.id)),
    db.select().from(storyBibleEntries).where(eq(storyBibleEntries.projectId, project.id)),
    db.select().from(storylines).where(eq(storylines.projectId, project.id)).orderBy(asc(storylines.position)),
    db.select().from(storylineNodes).where(eq(storylineNodes.projectId, project.id)).orderBy(asc(storylineNodes.position)),
  ]);
  const storyPlan = ((project.settings as Record<string, unknown>).storyPlan as Record<string, unknown> | undefined) ?? {};
  if (!Object.keys(storyPlan).length) throw new Error("请先保存正式故事总纲");
  const custom = (taskType: string) => promptRows.find((item) => item.taskType === taskType && item.enabled)?.customPrompt ?? "";
  const context = { project: { title: project.title, genre: project.genre, targetWords: project.targetWords, targetChapters: project.targetChapters }, storyPlan, characters: people.map((item) => ({ name: item.name, coreDesire: item.coreDesire, externalGoal: item.externalGoal, internalNeed: item.internalNeed, profile: item.profile })), storylines: storylineRows, storylineNodes: nodeRows, hardRules: rules.filter((item) => item.strength === "hard"), instruction: run.userInstruction };
  const coordinatorContext = {
    project: context.project,
    storyPlan: compactStoryPlan(storyPlan),
    characters: people.map((item) => { const profile = item.profile as Record<string, unknown>; return { name: item.name, role: profile.role ?? "", coreDesire: item.coreDesire, arcStart: profile.arcStart ?? "", arcTarget: profile.arcTarget ?? "" }; }),
    storylines: storylineRows.map((item) => ({ name: item.name, storylineType: item.storylineType, priority: item.priority, initialState: item.initialState, targetOutcome: item.targetOutcome, nextPlan: item.nextPlan })),
    storylineNodes: [],
    hardRules: rules.filter((item) => item.strength === "hard").map((item) => ({ name: item.name, summary: item.summary })),
    instruction: run.userInstruction,
  };
  const provider = getAiProvider();
  const manifest = run.inputManifest as Record<string, unknown>;
  const savedStages = manifest.stages && typeof manifest.stages === "object" && !Array.isArray(manifest.stages) ? manifest.stages as Record<string, unknown> : {};
  const saveStage = async (stage: string, stages: Record<string, unknown>) => db.update(generationRuns).set({ inputManifest: { ...manifest, approvalStatus: "not_generated", stage, stages }, updatedAt: new Date() }).where(eq(generationRuns.id, run.id));

  // 失败重试优先复用已经持久化的阶段草案，避免每次校验格式错误都重新调用前置模型。
  let volumeDraft = savedStages.volumeDraft as Record<string, unknown> | undefined;
  if (!volumeDraft || !Array.isArray(volumeDraft.volumes)) {
    const volumeDraftRaw = await provider.generateVolumePlan({ storyPlan, genre: project.genre, targetChapters: project.targetChapters, instruction: run.userInstruction, defaultPrompt: getDefaultPrompt("story.volumes.generate"), customPrompt: custom("story.volumes.generate") });
    volumeDraft = { volumes: (Array.isArray(volumeDraftRaw.volumes) ? volumeDraftRaw.volumes as Array<Record<string, unknown>> : []).map((volume, index) => ({ ...volume, volumeKey: `volume_${index + 1}` })) };
    await saveStage("volume_planned", { volumeDraft });
  }

  let foreshadowingDraft = savedStages.foreshadowingDraft as Record<string, unknown> | undefined;
  if (!foreshadowingDraft || !Array.isArray(foreshadowingDraft.foreshadowings)) {
    const foreshadowingDraftRaw = await provider.planForeshadowings({ context, defaultPrompt: getDefaultPrompt("story.foreshadowings.plan"), customPrompt: custom("story.foreshadowings.plan") });
    // 模型可能忽略数量约束；服务端再次限制规模，防止协调阶段上下文和 JSON 输出失控。
    const plannedThreads = Array.isArray(foreshadowingDraftRaw.foreshadowings) ? foreshadowingDraftRaw.foreshadowings as Array<Record<string, unknown>> : [];
    foreshadowingDraft = { foreshadowings: [...plannedThreads.filter((item) => item.importance === "core").slice(0, 4), ...plannedThreads.filter((item) => item.importance !== "core").slice(0, 4)] };
    await saveStage("foreshadowing_planned", { volumeDraft, foreshadowingDraft });
  }

  let coordinatedPlan = savedStages.coordinatedPlan as Record<string, unknown> | undefined;
  if (!coordinatedPlan || !Array.isArray(coordinatedPlan.placements)) {
    const threads = foreshadowingDraft.foreshadowings as Array<Record<string, unknown>>;
    const savedProgress = savedStages.coordinatorProgress && typeof savedStages.coordinatorProgress === "object" && !Array.isArray(savedStages.coordinatorProgress) ? savedStages.coordinatorProgress as Record<string, unknown> : {};
    const processedKeys = Array.isArray(savedProgress.processedKeys) ? savedProgress.processedKeys.map(String) : [];
    let coordinatedVolumes = Array.isArray(savedProgress.volumes) ? savedProgress.volumes as Array<Record<string, unknown>> : volumeDraft.volumes as Array<Record<string, unknown>>;
    let placements = Array.isArray(savedProgress.placements) ? savedProgress.placements as Array<Record<string, unknown>> : [];
    for (const thread of threads) {
      const key = String(thread.key ?? "");
      if (processedKeys.includes(key)) continue;
      // 每次只规划一条伏笔，显著缩小输出，并在每条完成后保存断点。
      const partial = await provider.coordinateNarrative({ context: coordinatorContext, volumeDraft: { volumes: coordinatedVolumes }, foreshadowingDraft: { foreshadowings: [thread] }, defaultPrompt: getDefaultPrompt("story.narrative.coordinate"), customPrompt: custom("story.narrative.coordinate") });
      if (Array.isArray(partial.volumes)) coordinatedVolumes = partial.volumes as Array<Record<string, unknown>>;
      const threadPlacements = Array.isArray(partial.placements) ? (partial.placements as Array<Record<string, unknown>>).filter((item) => String(item.foreshadowingKey) === key) : [];
      placements = [...placements.filter((item) => String(item.foreshadowingKey) !== key), ...threadPlacements];
      processedKeys.push(key);
      await saveStage("coordinating", { volumeDraft, foreshadowingDraft, coordinatorProgress: { processedKeys, volumes: coordinatedVolumes, placements } });
    }
    coordinatedPlan = { volumes: coordinatedVolumes, foreshadowings: threads, placements };
    await saveStage("coordinated", { volumeDraft, foreshadowingDraft, coordinatedPlan });
  }

  const validatePlan = async (plan: Record<string, unknown>) => {
    try { return mergeDeterministicValidation(plan, await provider.validateStructure({ context: coordinatorContext, coordinatedPlan: plan, defaultPrompt: getDefaultPrompt("story.structure.validate"), customPrompt: custom("story.structure.validate") })); }
    catch (error) {
      // 模型语义校验不可用时仍执行确定性校验，并把模型错误降级为人工复核提示。
      return mergeDeterministicValidation(plan, { passed: true, issues: [{ code: "MODEL_VALIDATION_UNAVAILABLE", severity: "warning", message: error instanceof Error ? error.message : "模型校验不可用", foreshadowingKey: "", affectedVolumeKeys: [], suggestion: "接受后人工检查伏笔规划。" }], summary: "模型校验失败，已完成服务端确定性校验。" });
    }
  };
  let validation = await validatePlan(coordinatedPlan);
  const revisionHistory: Array<Record<string, unknown>> = [];
  const hasErrors = (result: Record<string, unknown>) => result.passed !== true || (Array.isArray(result.issues) && result.issues.some((issue) => (issue as Record<string, unknown>).severity === "error"));
  if (hasErrors(validation)) {
    const issues = Array.isArray(validation.issues) ? validation.issues as Array<Record<string, unknown>> : [];
    let currentThreads = coordinatedPlan.foreshadowings as Array<Record<string, unknown>>;
    const keys = [...new Set(issues.filter((issue) => issue.severity === "error" && issue.foreshadowingKey).map((issue) => String(issue.foreshadowingKey)))];
    // 按伏笔分组局部修订；单组失败只进入人工复核，不阻断其他伏笔和 FinalPlan。
    for (const key of keys) {
      const thread = currentThreads.find((item) => String(item.key) === key);
      if (!thread) continue;
      const groupIssues = issues.filter((issue) => String(issue.foreshadowingKey) === key);
      const placements = (coordinatedPlan.placements as Array<Record<string, unknown>>).filter((item) => String(item.foreshadowingKey) === key);
      const partialPlan = { volumes: coordinatedPlan.volumes, foreshadowings: [thread], placements };
      try {
        const revised = await provider.reviseStructure({ context: coordinatorContext, coordinatedPlan: partialPlan, validation: { passed: false, issues: groupIssues }, defaultPrompt: getDefaultPrompt("story.structure.revise"), customPrompt: custom("story.structure.revise") });
        const revisedThread = Array.isArray(revised.foreshadowings) ? revised.foreshadowings[0] as Record<string, unknown> | undefined : undefined;
        if (revisedThread) { currentThreads = currentThreads.map((item) => String(item.key) === key ? { ...item, ...revisedThread, key } : item); coordinatedPlan.foreshadowings = currentThreads; }
        const revisedPlacements = Array.isArray(revised.placements) ? (revised.placements as Array<Record<string, unknown>>).map((item) => ({ ...item, foreshadowingKey: key })) : placements;
        coordinatedPlan.placements = [...(coordinatedPlan.placements as Array<Record<string, unknown>>).filter((item) => String(item.foreshadowingKey) !== key), ...revisedPlacements];
        revisionHistory.push({ foreshadowingKey: key, status: "revised", issues: groupIssues, notes: revised.revisionNotes ?? [] });
      } catch (error) {
        revisionHistory.push({ foreshadowingKey: key, status: "manual_review", issues: groupIssues, error: error instanceof Error ? error.message : "局部修订失败" });
      }
    }
    validation = await validatePlan(coordinatedPlan);
  }
  const unresolvedIssues = Array.isArray(validation.issues) ? (validation.issues as Array<Record<string, unknown>>).filter((issue) => issue.severity === "error") : [];
  const unresolvedForeshadowingKeys = [...new Set(unresolvedIssues.map((issue) => String(issue.foreshadowingKey ?? "")).filter(Boolean))];
  const finalPlan = { volumes: coordinatedPlan.volumes ?? [], foreshadowings: coordinatedPlan.foreshadowings ?? [], placements: coordinatedPlan.placements ?? [], validation, revisionHistory, acceptanceAllowed: true, manualReviewRequired: unresolvedIssues.length > 0, unresolvedForeshadowingKeys };
  const [completed] = await db.update(generationRuns).set({ status: "completed", parsedOutput: finalPlan, inputManifest: { ...manifest, approvalStatus: "pending", stage: "final_plan", validationPassed: !hasErrors(validation), manualReviewRequired: unresolvedIssues.length > 0 }, updatedAt: new Date() }).where(eq(generationRuns.id, run.id)).returning();
  return completed;
}

async function processRollingPlanning(run: GenerationRun) {
  const [project] = await db.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
  if (!project) throw new Error("项目不存在");
  const storyPlan = ((project.settings as Record<string, unknown>).storyPlan as Record<string, unknown> | undefined) ?? {};
  // v2 是唯一受支持的总纲结构，避免旧版全书规划字段悄悄进入新周期。
  if (storyPlan.schemaVersion !== 2) throw new Error("请先将故事总纲保存为最新的 v2 结构");
  const [people, lines, nodes, rules, promptRows, latestCycle, existingThreads] = await Promise.all([
    db.select().from(characters).where(eq(characters.projectId, project.id)),
    db.select().from(storylines).where(eq(storylines.projectId, project.id)).orderBy(asc(storylines.position)),
    db.select().from(storylineNodes).where(eq(storylineNodes.projectId, project.id)).orderBy(asc(storylineNodes.position)),
    db.select().from(storyBibleEntries).where(eq(storyBibleEntries.projectId, project.id)),
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, project.id)),
    db.select().from(planningCycles).where(eq(planningCycles.projectId, project.id)).orderBy(desc(planningCycles.cycleNumber)).limit(1),
    db.select().from(foreshadowings).where(eq(foreshadowings.projectId, project.id)),
  ]);
  const horizon = { detailedVolumes: 1, previewVolumes: 1, detailedChapters: 5 };
  const context = {
    project: { title: project.title, genre: project.genre, targetWords: project.targetWords, targetChapters: project.targetChapters },
    storyPlan,
    characters: people.map((item) => ({ name: item.name, coreDesire: item.coreDesire, externalGoal: item.externalGoal, internalNeed: item.internalNeed, role: (item.profile as Record<string, unknown>).role ?? "" })),
    storylines: lines.map((item) => ({ name: item.name, type: item.storylineType, status: item.status, narrativeStatus: item.narrativeStatus, currentProgress: item.currentProgress, nextPlan: item.nextPlan })),
    storylineNodes: nodes.filter((item) => item.status !== "completed").slice(0, 12).map((item) => ({ title: item.title, objective: item.objective, entryCondition: item.entryCondition, narrativeStatus: item.narrativeStatus })),
    hardRules: rules.filter((item) => item.strength === "hard").map((item) => ({ name: item.name, summary: item.summary })),
    existingForeshadowings: existingThreads.filter((item) => item.status !== "paid_off" && item.status !== "abandoned").map((item) => ({ title: item.title, purpose: item.purpose, importance: item.importance, commitmentLevel: item.commitmentLevel, targetPayoffStage: item.targetPayoffStage })),
    instruction: run.userInstruction,
  };
  const customPrompt = promptRows.find((item) => item.taskType === "story.rolling.plan" && item.enabled)?.customPrompt ?? "";
  const output = await getAiProvider().planRollingStructure({ context, horizon, defaultPrompt: getDefaultPrompt("story.rolling.plan"), customPrompt });
  const volumes = Array.isArray(output.volumes) ? output.volumes as Array<Record<string, unknown>> : [];
  const chapterWindow = Array.isArray(output.chapterWindow) ? output.chapterWindow as Array<Record<string, unknown>> : [];
  if (output.schemaVersion !== 2 || volumes.length < 1 || !output.activeArc || !chapterWindow.length) throw new Error("模型未返回完整的滚动规划 v2");
  const finalPlan = { ...output, schemaVersion: 2, planningCycle: { cycleNumber: (latestCycle[0]?.cycleNumber ?? 0) + 1, triggerType: "manual", horizon }, acceptanceAllowed: true };
  const [completed] = await db.update(generationRuns).set({ status: "completed", parsedOutput: finalPlan, inputManifest: { ...run.inputManifest, approvalStatus: "pending", schemaVersion: 2 }, updatedAt: new Date() }).where(eq(generationRuns.id, run.id)).returning();
  return completed;
}

export async function processGeneration(runId: string) {
  const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, runId)).limit(1);
  if (!run || run.status !== "queued") return null;

  // Claim before doing model work. A production multi-worker implementation will
  // replace this with SELECT ... FOR UPDATE SKIP LOCKED.
  const [claimed] = await db.update(generationRuns).set({ status: "running", updatedAt: new Date() })
    .where(eq(generationRuns.id, run.id)).returning();
  if (!claimed) return null;

  try {
    if (run.taskType === "story.rolling.plan") return await processRollingPlanning(run);
    if (run.taskType === "story.plan" || run.taskType === "story.volumes.generate" || run.taskType === "story.bible.generate") {
      const [project] = await db.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
      if (!project) throw new Error("Project not found");
      const [promptRows, people, entries] = await Promise.all([
        db.select().from(promptTemplates).where(eq(promptTemplates.projectId, project.id)),
        db.select().from(characters).where(eq(characters.projectId, project.id)),
        db.select().from(storyBibleEntries).where(eq(storyBibleEntries.projectId, project.id)),
      ]);
      const customPrompt = promptRows.find((item) => item.taskType === run.taskType && item.enabled)?.customPrompt ?? "";
      const input = run.inputManifest as Record<string, unknown>;
      const provider = getAiProvider();
      const storyPlan = (project.settings as Record<string, unknown>).storyPlan as Record<string, unknown> | undefined;
      const output = run.taskType === "story.plan"
        ? await provider.generateStoryPlan({ brief: run.userInstruction, genre: project.genre, targetChapters: project.targetChapters, defaultPrompt: getDefaultPrompt(run.taskType), customPrompt })
        : run.taskType === "story.volumes.generate"
          ? await provider.generateVolumePlan({ storyPlan: storyPlan ?? {}, genre: project.genre, targetChapters: project.targetChapters, instruction: run.userInstruction, defaultPrompt: getDefaultPrompt(run.taskType), customPrompt })
          : await provider.generateStoryBible({ brief: run.userInstruction, genre: project.genre, existingNames: [...people.map((item) => item.name), ...entries.map((item) => item.name)], defaultPrompt: getDefaultPrompt(run.taskType), customPrompt });
      const [completed] = await db.update(generationRuns).set({ status: "completed", parsedOutput: output, inputManifest: { ...input, approvalStatus: "pending" }, updatedAt: new Date() }).where(eq(generationRuns.id, run.id)).returning();
      return completed;
    }
    if (!run.chapterId) throw new Error("Chapter is required for this task");
    const [chapter] = await db.select().from(chapters).where(eq(chapters.id, run.chapterId)).limit(1);
    if (!chapter) throw new Error("Chapter not found");
    const [sceneRows, hardRules, people, manuscripts, promptRows] = await Promise.all([
      db.select().from(scenes).where(eq(scenes.chapterId, chapter.id)).orderBy(asc(scenes.position)),
      db.select().from(storyBibleEntries).where(eq(storyBibleEntries.projectId, chapter.projectId)),
      db.select().from(characters).where(eq(characters.projectId, chapter.projectId)),
      db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, chapter.id)).orderBy(desc(manuscriptVersions.versionNo)).limit(1),
      db.select().from(promptTemplates).where(eq(promptTemplates.projectId, chapter.projectId)),
    ]);
    const requestedSceneId = String((run.inputManifest as Record<string, unknown>).sceneId ?? "");
    const scene = sceneRows.find((item) => item.id === requestedSceneId) ?? sceneRows[0];
    const output = await getAiProvider().writeScene({
      chapterTitle: chapter.title,
      chapterOutline: chapter.outline,
      sceneTitle: scene?.title,
      sceneOutline: scene?.outline,
      hardRules: hardRules.filter((item) => item.strength === "hard").map((item) => ({ id: item.id, name: item.name, summary: item.summary })),
      characters: people.map((item) => ({ id: item.id, name: item.name, coreDesire: item.coreDesire, externalGoal: item.externalGoal, internalNeed: item.internalNeed, behaviorConstraints: item.behaviorConstraints, profile: item.profile })),
      previousText: manuscripts[0]?.contentText ?? "",
      instruction: run.userInstruction,
      defaultPrompt: getDefaultPrompt(run.taskType),
      customPrompt: promptRows.find((item) => item.taskType === run.taskType && item.enabled)?.customPrompt ?? "",
    });
    const [latestRun] = await db.select({ status: generationRuns.status }).from(generationRuns).where(eq(generationRuns.id, run.id)).limit(1);
    if (latestRun?.status === "cancelled") return null;
    const [completed] = await db.update(generationRuns).set({ status: "completed", parsedOutput: output, updatedAt: new Date() }).where(eq(generationRuns.id, run.id)).returning();
    return completed;
  } catch (error) {
    await db.update(generationRuns).set({ status: "failed", parsedOutput: { error: error instanceof Error ? error.message : "Unknown worker error" }, updatedAt: new Date() }).where(eq(generationRuns.id, run.id));
    return null;
  }
}
