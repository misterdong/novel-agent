import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { autopilotEvents, autopilotRuns, characterKnowledge, characterRelationships, characters, chapters, chapterSummaries, foreshadowings, manuscriptVersions, projects, promptTemplates, reviewIssues, scenes, storylineNodes, storylines, storyBibleEntries, storyItems, timelineEvents, volumes } from "@/db/schema";
import { getPublicAiConfig } from "./config";
import { getDefaultPrompt } from "./prompt-catalog";
import { getAiProvider } from "./provider-factory";

export async function processAutopilot(runId: string) {
  // PostgreSQL 是流程状态的唯一可信来源。Worker 每次调用只执行一次状态转换，
  // 不把关键进度只保存在进程内存中。
  const [run] = await db.select().from(autopilotRuns).where(eq(autopilotRuns.id, runId)).limit(1);
  if (!run || ["paused", "completed", "failed", "cancelled"].includes(run.status)) return null;
  try {
    if (run.currentStage === "queued") {
      return updateRun(run.id, { status: "running", currentStage: "planning_chapter", progress: 5, lastMessage: "正在依据总纲规划下一章", startedAt: new Date() });
    }
    if (run.currentStage === "planning_chapter") return planChapter(run);
    if (run.currentStage === "writing_scenes") return writeNextScene(run);
    if (run.currentStage === "reviewing_chapter") return reviewChapter(run);
    if (run.currentStage === "repairing_chapter") return repairChapter(run);
    if (run.currentStage === "completing_chapter") return completeChapter(run);
    throw new Error(`不支持的自动创作阶段：${run.currentStage}`);
  } catch (error) {
    return updateRun(run.id, { status: "failed", errorMessage: error instanceof Error ? error.message : "自动创作失败", lastMessage: "任务已停止，请检查错误后重试" });
  }
}

type AutopilotRun = typeof autopilotRuns.$inferSelect;

async function planChapter(run: AutopilotRun) {
  // 章节规划同时使用长期结构和最近章节的真实正文结尾，
  // 避免大纲虽然合理，却重复执行正文中已经完成的事件。
  const [volume, previousChapters, people, rules, prompts, threads, timeline, knowledge, items, relationships, storylineRows, nodeRows] = await Promise.all([
    db.select().from(volumes).where(eq(volumes.projectId, run.projectId)).orderBy(asc(volumes.position)).limit(1),
    db.select().from(chapters).where(eq(chapters.projectId, run.projectId)).orderBy(asc(chapters.position)),
    db.select().from(characters).where(eq(characters.projectId, run.projectId)),
    db.select().from(storyBibleEntries).where(and(eq(storyBibleEntries.projectId, run.projectId), eq(storyBibleEntries.strength, "hard"))),
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, run.projectId)),
    db.select().from(foreshadowings).where(eq(foreshadowings.projectId, run.projectId)),
    db.select().from(timelineEvents).where(eq(timelineEvents.projectId, run.projectId)).orderBy(desc(timelineEvents.createdAt)).limit(30),
    db.select().from(characterKnowledge).where(and(eq(characterKnowledge.projectId, run.projectId), eq(characterKnowledge.active, true))),
    db.select().from(storyItems).where(and(eq(storyItems.projectId, run.projectId), eq(storyItems.active, true))),
    db.select().from(characterRelationships).where(and(eq(characterRelationships.projectId, run.projectId), eq(characterRelationships.active, true))),
    db.select().from(storylines).where(eq(storylines.projectId, run.projectId)).orderBy(asc(storylines.position)),
    db.select().from(storylineNodes).where(eq(storylineNodes.projectId, run.projectId)).orderBy(asc(storylineNodes.position)),
  ]);
  if (!volume[0]) throw new Error("项目还没有分卷，无法规划章节");
  const summaries = await db.select().from(chapterSummaries).where(eq(chapterSummaries.projectId, run.projectId)).orderBy(desc(chapterSummaries.createdAt));
  const recentChapters = previousChapters.slice(-5);
  const latestVersions = await Promise.all(recentChapters.map((chapter) => db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, chapter.id)).orderBy(desc(manuscriptVersions.versionNo)).limit(1)));
  const [projectRow] = await db.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
  if (!projectRow) throw new Error("项目不存在");
  const customPrompt = prompts.find((item) => item.taskType === "autopilot.chapter.plan" && item.enabled)?.customPrompt ?? "";
  const modelStartedAt = Date.now();
  const plan = await getAiProvider().planChapter({
    storyPlan: ((projectRow.settings as Record<string, unknown>).storyPlan as Record<string, unknown> | undefined) ?? {},
    // 分卷的完整阶段规划会约束章节目标、冲突升级、转折和收尾方向。
    volume: { title: volume[0].title, objective: volume[0].objective, conflict: volume[0].conflict, turningPoint: volume[0].turningPoint, endingHook: volume[0].endingHook },
    previousChapters: recentChapters.map((chapter, index) => {
      const text = latestVersions[index][0]?.contentText ?? "";
      return { title: chapter.title, outline: chapter.outline, summary: summaries.find((item) => item.chapterId === chapter.id)?.shortSummary ?? text.slice(0, 600), ending: text.slice(-1200) };
    }),
    characters: people.map((person) => ({ name: person.name, coreDesire: person.coreDesire, externalGoal: person.externalGoal, internalNeed: person.internalNeed, behaviorConstraints: person.behaviorConstraints, profile: person.profile })),
    hardRules: rules.map((rule) => ({ name: rule.name, summary: rule.summary })),
    foreshadowings: threads.map((item) => ({ title: item.title, purpose: item.purpose, status: item.status, importance: item.importance, truth: item.truth, hiddenInformation: item.hiddenInformation })),
    timeline: timeline.map((item) => ({ title: item.title, description: item.description, relativeDay: item.relativeDay, locationName: item.locationName })),
    characterKnowledge: knowledge.map((item) => ({ characterName: people.find((person) => person.id === item.characterId)?.name ?? "未知人物", proposition: item.proposition, state: item.state })),
    storyItems: items.map((item) => ({ id: item.id, name: item.name, itemType: item.itemType, holderName: people.find((person) => person.id === item.holderCharacterId)?.name ?? "", currentLocation: item.currentLocation, status: item.status, storyFunction: item.storyFunction, nextPlan: item.nextPlan })),
    characterRelationships: relationships.map((item) => ({ characterAName: people.find((person) => person.id === item.characterAId)?.name ?? "", characterBName: people.find((person) => person.id === item.characterBId)?.name ?? "", relationType: item.relationType, status: item.status, aToBAttitude: item.aToBAttitude, bToAAttitude: item.bToAAttitude, nextDirection: item.nextDirection })),
    // 每章最多注入一条核心故事线和两条辅助线，控制上下文体积和剧情发散。
    storylines: storylineRows.filter((line) => ["planned", "active"].includes(line.status)).sort((a, b) => ({ core: 0, important: 1, supporting: 2 }[a.priority] ?? 3) - ({ core: 0, important: 1, supporting: 2 }[b.priority] ?? 3)).slice(0, 3).map((line) => {
      const nextNode = nodeRows.find((node) => node.storylineId === line.id && ["planned", "foreshadowed"].includes(node.status));
      return { name: line.name, storylineType: line.storylineType, priority: line.priority, coreConflict: line.coreConflict, currentProgress: line.currentProgress, nextPlan: line.nextPlan, nextNode: nextNode ? { id: nextNode.id, title: nextNode.title, objective: nextNode.objective, entryCondition: nextNode.entryCondition } : null };
    }),
    targetWords: run.targetWords,
    instruction: `${getDefaultPrompt("autopilot.chapter.plan")}\n${customPrompt}\n${run.instruction}`,
  });
  await logModelEvent(run, "planning_chapter", "chapter_plan_generated", "AI 已生成章节与场景规划", Date.now() - modelStartedAt, { title: plan.title, sceneCount: plan.scenes.length, plan });
  const chapter = await db.transaction(async (tx) => {
    // 章节、空白正文版本和场景卡在同一事务中创建，
    // 即使 Worker 中途退出，也不会留下缺少初始版本的章节。
    const [created] = await tx.insert(chapters).values({ projectId: run.projectId, volumeId: volume[0].id, position: (previousChapters.at(-1)?.position ?? 0) + 1, title: plan.title, status: "writing", targetWords: run.targetWords, outline: { objective: plan.objective, conflict: plan.conflict, outcome: plan.outcome, endingHook: plan.endingHook, itemCandidates: plan.itemCandidates } }).returning();
    await tx.insert(manuscriptVersions).values({ chapterId: created.id, versionNo: 1, contentJson: { type: "doc", text: "" }, contentText: "", wordCount: 0, sourceType: "ai" });
    if (plan.scenes.length) await tx.insert(scenes).values(plan.scenes.map((scene, index) => ({ projectId: run.projectId, chapterId: created.id, position: index + 1, title: scene.title, targetWords: scene.targetWords, status: "writing" as const, outline: { objective: scene.objective, conflict: scene.conflict, outcome: scene.outcome } })));
    return created;
  });
  return updateRun(run.id, { chapterId: chapter.id, currentStage: "writing_scenes", currentSceneIndex: 0, progress: 20, lastMessage: `章节“${chapter.title}”规划完成，开始生成正文`, result: { plan } });
}

async function writeNextScene(run: AutopilotRun) {
  // 每个场景都会产生一个不可变的正文版本，不直接覆盖旧正文，
  // 因此用户始终可以在页面中恢复到生成前的版本。
  if (!run.chapterId) throw new Error("自动任务缺少章节");
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, run.chapterId)).limit(1);
  const sceneRows = await db.select().from(scenes).where(eq(scenes.chapterId, run.chapterId)).orderBy(asc(scenes.position));
  const scene = sceneRows[run.currentSceneIndex];
  if (!chapter || !scene) return updateRun(run.id, { currentStage: "reviewing_chapter", progress: 75, lastMessage: "正文生成完成，开始质量检查" });
  const [versions, rules, people, prompts, priorChapters, threads, timeline, knowledge, items, relationships] = await Promise.all([
    db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, chapter.id)).orderBy(desc(manuscriptVersions.versionNo)).limit(1),
    db.select().from(storyBibleEntries).where(and(eq(storyBibleEntries.projectId, run.projectId), eq(storyBibleEntries.strength, "hard"))),
    db.select().from(characters).where(eq(characters.projectId, run.projectId)),
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, run.projectId)),
    db.select().from(chapters).where(eq(chapters.projectId, run.projectId)).orderBy(asc(chapters.position)),
    db.select().from(foreshadowings).where(eq(foreshadowings.projectId, run.projectId)),
    db.select().from(timelineEvents).where(eq(timelineEvents.projectId, run.projectId)).orderBy(desc(timelineEvents.createdAt)).limit(30),
    db.select().from(characterKnowledge).where(and(eq(characterKnowledge.projectId, run.projectId), eq(characterKnowledge.active, true))),
    db.select().from(storyItems).where(and(eq(storyItems.projectId, run.projectId), eq(storyItems.active, true))),
    db.select().from(characterRelationships).where(and(eq(characterRelationships.projectId, run.projectId), eq(characterRelationships.active, true))),
  ]);
  const priorChapter = [...priorChapters].reverse().find((item) => item.position < chapter.position);
  // 新章节的第一个场景会收到上一章的真实结尾。
  // 摘要适合长期记忆，但不足以保证段落级衔接。
  const [priorVersion] = priorChapter ? await db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, priorChapter.id)).orderBy(desc(manuscriptVersions.versionNo)).limit(1) : [];
  const modelStartedAt = Date.now();
  const output = await getAiProvider().writeScene({ chapterTitle: chapter.title, chapterOutline: chapter.outline, sceneTitle: scene.title, sceneOutline: scene.outline, hardRules: rules.map((item) => ({ id: item.id, name: item.name, summary: item.summary })), characters: people.map((item) => ({ id: item.id, name: item.name, coreDesire: item.coreDesire, externalGoal: item.externalGoal, internalNeed: item.internalNeed, behaviorConstraints: item.behaviorConstraints, profile: item.profile })), previousText: versions[0]?.contentText ?? "", previousChapterEnding: priorVersion?.contentText.slice(-1200) ?? "", foreshadowings: threads.map((item) => ({ title: item.title, purpose: item.purpose, status: item.status, importance: item.importance, truth: item.truth, hiddenInformation: item.hiddenInformation })), timeline: timeline.map((item) => ({ title: item.title, description: item.description, relativeDay: item.relativeDay, locationName: item.locationName })), characterKnowledge: knowledge.map((item) => ({ characterName: people.find((person) => person.id === item.characterId)?.name ?? "未知人物", proposition: item.proposition, state: item.state })), storyItems: items.map((item) => ({ name: item.name, itemType: item.itemType, holderName: people.find((person) => person.id === item.holderCharacterId)?.name ?? "", currentLocation: item.currentLocation, status: item.status, storyFunction: item.storyFunction, nextPlan: item.nextPlan })), characterRelationships: relationships.map((item) => ({ characterAName: people.find((person) => person.id === item.characterAId)?.name ?? "", characterBName: people.find((person) => person.id === item.characterBId)?.name ?? "", relationType: item.relationType, status: item.status, aToBAttitude: item.aToBAttitude, bToAAttitude: item.bToAAttitude, nextDirection: item.nextDirection })), instruction: run.instruction, defaultPrompt: getDefaultPrompt("chapter.continue"), customPrompt: prompts.find((item) => item.taskType === "chapter.continue" && item.enabled)?.customPrompt ?? "" });
  const content = [versions[0]?.contentText.trim(), output.prose.trim()].filter(Boolean).join("\n\n");
  const wordCount = content.replace(/\s/g, "").length;
  await logModelEvent(run, "writing_scenes", "scene_generated", `AI 已生成场景：${scene.title}`, Date.now() - modelStartedAt, { sceneId: scene.id, sceneTitle: scene.title, scenePosition: scene.position, generatedWords: output.prose.replace(/\s/g, "").length, prose: output.prose, coveredEvents: output.coveredEvents, characterCandidates: output.characterCandidates.map((item) => item.name) });
  await db.transaction(async (tx) => {
    await tx.insert(manuscriptVersions).values({ chapterId: chapter.id, versionNo: (versions[0]?.versionNo ?? 0) + 1, contentJson: { type: "doc", text: content }, contentText: content, wordCount, sourceType: "ai" });
    await tx.update(chapters).set({ currentWords: wordCount, updatedAt: new Date() }).where(eq(chapters.id, chapter.id));
    await tx.update(scenes).set({ status: "completed", updatedAt: new Date() }).where(eq(scenes.id, scene.id));
    if (output.characterCandidates.length) await tx.insert(characters).values(output.characterCandidates.map((person) => ({ projectId: run.projectId, name: person.name, coreDesire: person.coreDesire, externalGoal: person.externalGoal, internalNeed: person.internalNeed ?? "", behaviorConstraints: person.behaviorConstraints ?? [], profile: { gender: person.gender ?? "", age: person.age ?? "", role: person.role ?? "", personality: person.personality ?? "", appearance: person.appearance ?? "", background: person.background ?? "" } }))).onConflictDoNothing();
  });
  const nextIndex = run.currentSceneIndex + 1;
  const progress = Math.min(72, 20 + Math.round((nextIndex / sceneRows.length) * 52));
  return updateRun(run.id, { currentSceneIndex: nextIndex, progress, lastMessage: `已完成场景 ${nextIndex}/${sceneRows.length}：${scene.title}` });
}

async function reviewChapter(run: AutopilotRun) {
  // 审校只读取已经确认的规则、时间线、人物认知、人物关系和剧情道具。
  // 尚未审批的记忆候选不能约束正式正文。
  if (!run.chapterId) throw new Error("自动任务缺少章节");
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, run.chapterId)).limit(1);
  const [version] = await db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, run.chapterId)).orderBy(desc(manuscriptVersions.versionNo)).limit(1);
  if (!chapter || !version) throw new Error("章节正文不存在");
  const priorRows = await db.select().from(chapters).where(eq(chapters.projectId, run.projectId)).orderBy(asc(chapters.position));
  const priorChapter = [...priorRows].reverse().find((item) => item.position < chapter.position);
  const [priorVersion] = priorChapter ? await db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, priorChapter.id)).orderBy(desc(manuscriptVersions.versionNo)).limit(1) : [];
  const [rules, people, timeline, knowledge, prompts, threads, items, relationships] = await Promise.all([db.select().from(storyBibleEntries).where(and(eq(storyBibleEntries.projectId, run.projectId), eq(storyBibleEntries.strength, "hard"))), db.select().from(characters).where(eq(characters.projectId, run.projectId)), db.select().from(timelineEvents).where(eq(timelineEvents.projectId, run.projectId)), db.select().from(characterKnowledge).where(and(eq(characterKnowledge.projectId, run.projectId), eq(characterKnowledge.active, true))), db.select().from(promptTemplates).where(eq(promptTemplates.projectId, run.projectId)), db.select().from(foreshadowings).where(eq(foreshadowings.projectId, run.projectId)), db.select().from(storyItems).where(and(eq(storyItems.projectId, run.projectId), eq(storyItems.active, true))), db.select().from(characterRelationships).where(and(eq(characterRelationships.projectId, run.projectId), eq(characterRelationships.active, true)))]);
  const modelStartedAt = Date.now();
  const findings = await getAiProvider().reviewChapter({ chapterTitle: chapter.title, chapterOutline: chapter.outline, manuscript: version.contentText, previousChapterEnding: priorVersion?.contentText.slice(-1200) ?? "", hardRules: rules.map((item) => ({ id: item.id, name: item.name, summary: item.summary })), characters: people.map((item) => ({ id: item.id, name: item.name, coreDesire: item.coreDesire, externalGoal: item.externalGoal, internalNeed: item.internalNeed, behaviorConstraints: item.behaviorConstraints, profile: item.profile })), timeline: timeline.map((item) => ({ title: item.title, description: item.description, relativeDay: item.relativeDay, locationName: item.locationName })), characterKnowledge: knowledge.map((item) => ({ characterName: people.find((person) => person.id === item.characterId)?.name ?? "未知人物", proposition: item.proposition, state: item.state })), foreshadowings: threads.map((item) => ({ title: item.title, purpose: item.purpose, status: item.status, importance: item.importance, truth: item.truth, hiddenInformation: item.hiddenInformation })), storyItems: items.map((item) => ({ name: item.name, holderName: people.find((person) => person.id === item.holderCharacterId)?.name ?? "", currentLocation: item.currentLocation, status: item.status, storyFunction: item.storyFunction })), characterRelationships: relationships.map((item) => ({ characterAName: people.find((person) => person.id === item.characterAId)?.name ?? "", characterBName: people.find((person) => person.id === item.characterBId)?.name ?? "", relationType: item.relationType, status: item.status, aToBAttitude: item.aToBAttitude, bToAAttitude: item.bToAAttitude })), defaultPrompt: getDefaultPrompt("review.continuity"), customPrompt: prompts.find((item) => item.taskType === "review.continuity" && item.enabled)?.customPrompt ?? "" });
  await logModelEvent(run, "reviewing_chapter", "chapter_reviewed", `AI 审校完成，发现 ${findings.length} 个问题`, Date.now() - modelStartedAt, { issueCount: findings.length, errors: findings.filter((item) => item.severity === "error").length, warnings: findings.filter((item) => item.severity === "warning").length, findings });
  if (findings.length) await db.insert(reviewIssues).values(findings.map((item) => ({ ...item, projectId: run.projectId, chapterId: chapter.id, manuscriptVersionId: version.id })));
  const blocking = findings.filter((item) => item.severity === "error" || item.severity === "warning");
  // 建议级问题只展示，不触发自动改写；错误和警告才进入有限修复循环，
  // 防止模型持续产生新问题而导致任务无限执行。
  if (blocking.length && run.repairCount < run.maxRepairs) return updateRun(run.id, { currentStage: "repairing_chapter", progress: 84, lastMessage: `发现 ${blocking.length} 个问题，正在自动修复`, result: { ...run.result, findings: blocking } });
  return updateRun(run.id, { currentStage: "completing_chapter", progress: 94, lastMessage: blocking.length ? "已达到最大修复次数，保留问题并完成章节" : "质量检查通过" });
}

async function repairChapter(run: AutopilotRun) {
  if (!run.chapterId) throw new Error("自动任务缺少章节");
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, run.chapterId)).limit(1);
  const [version] = await db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, run.chapterId)).orderBy(desc(manuscriptVersions.versionNo)).limit(1);
  if (!chapter || !version) throw new Error("章节正文不存在");
  const findings = (run.result.findings as Array<{ title?: string; explanation?: string; suggestions?: Array<Record<string, unknown>> }> | undefined) ?? [];
  const [rules, people] = await Promise.all([
    db.select().from(storyBibleEntries).where(and(eq(storyBibleEntries.projectId, run.projectId), eq(storyBibleEntries.strength, "hard"))),
    db.select().from(characters).where(eq(characters.projectId, run.projectId)),
  ]);
  const modelStartedAt = Date.now();
  const output = await getAiProvider().repairChapter({
    chapterTitle: chapter.title,
    chapterOutline: chapter.outline,
    manuscript: version.contentText,
    findings,
    hardRules: rules.map((item) => ({ id: item.id, name: item.name, summary: item.summary })),
    characters: people.map((item) => ({ id: item.id, name: item.name, coreDesire: item.coreDesire, externalGoal: item.externalGoal, internalNeed: item.internalNeed, behaviorConstraints: item.behaviorConstraints, profile: item.profile })),
  });
  await logModelEvent(run, "repairing_chapter", "chapter_repaired", `AI 已完成第 ${run.repairCount + 1} 次修复`, Date.now() - modelStartedAt, { repairCount: run.repairCount + 1, addressedIssues: findings.map((item) => item.title) });
  // 修复返回完整正文，而不是向末尾追加补丁，这样才能删除重复内容或调整顺序；
  // 修复前版本仍然保留，可随时恢复。
  const content = output.prose.trim();
  const wordCount = content.replace(/\s/g, "").length;
  await db.transaction(async (tx) => { await tx.insert(manuscriptVersions).values({ chapterId: chapter.id, versionNo: version.versionNo + 1, contentJson: { type: "doc", text: content }, contentText: content, wordCount, sourceType: "rewrite" }); await tx.update(chapters).set({ currentWords: wordCount, updatedAt: new Date() }).where(eq(chapters.id, chapter.id)); });
  return updateRun(run.id, { repairCount: run.repairCount + 1, currentStage: "reviewing_chapter", progress: 86, lastMessage: `第 ${run.repairCount + 1} 次自动修复完成，重新检查` });
}

async function completeChapter(run: AutopilotRun) {
  if (run.chapterId) await db.update(chapters).set({ status: "completed", updatedAt: new Date() }).where(eq(chapters.id, run.chapterId));
  return updateRun(run.id, { status: "completed", currentStage: "completed", progress: 100, lastMessage: "自动章节创作完成", completedAt: new Date() });
}

async function updateRun(id: string, values: Partial<typeof autopilotRuns.$inferInsert>) {
  // 任务状态与面向用户的日志事件在同一事务中提交，
  // 避免进度面板显示数据库中并未真正发生的状态转换。
  const [current] = await db.select().from(autopilotRuns).where(eq(autopilotRuns.id, id)).limit(1);
  if (!current) return undefined;
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(autopilotRuns).set({ ...values, updatedAt: new Date() }).where(eq(autopilotRuns.id, id)).returning();
    if (values.lastMessage) await tx.insert(autopilotEvents).values({ runId: current.id, projectId: current.projectId, chapterId: values.chapterId ?? current.chapterId, stage: String(values.currentStage ?? current.currentStage), eventType: values.status === "failed" ? "stage_failed" : values.status === "completed" ? "run_completed" : "stage_transition", level: values.status === "failed" ? "error" : "info", message: String(values.lastMessage), details: { progress: values.progress ?? current.progress, previousStage: current.currentStage, nextStage: values.currentStage ?? current.currentStage, error: values.errorMessage ?? "" } });
    return updated;
  });
}

async function logModelEvent(run: AutopilotRun, stage: string, eventType: string, message: string, durationMs: number, details: Record<string, unknown>) {
  const config = getPublicAiConfig();
  await db.insert(autopilotEvents).values({ runId: run.id, projectId: run.projectId, chapterId: run.chapterId, stage, eventType, message, durationMs, provider: config.provider, model: config.model, details });
}
