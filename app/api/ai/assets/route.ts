import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { characters, foreshadowingPlacements, foreshadowings, generationRuns, planningCycles, projects, storyArcs, storyBibleEntries, storyStateSnapshots, volumes } from "@/db/schema";

const createSchema = z.object({ projectId: z.string().uuid(), taskType: z.enum(["story.plan", "story.volumes.generate", "story.bible.generate", "story.rolling.plan"]), brief: z.string().trim().max(12000) }).superRefine((value, context) => {
  if (!["story.volumes.generate", "story.rolling.plan"].includes(value.taskType) && value.brief.length < 10) context.addIssue({ code: "custom", message: "生成要求至少需要 10 个字符", path: ["brief"] });
});
const acceptSchema = z.object({ runId: z.string().uuid() });

// 将模型返回的分卷草案统一转换为数据库字段，避免接受草案时遗漏规划信息。
function volumePlanValues(plan: Record<string, unknown>, position: number) {
  return {
    position,
    title: String(plan.title ?? `第${position}卷`),
    objective: String(plan.objective ?? ""),
    conflict: String(plan.conflict ?? ""),
    turningPoint: String(plan.turningPoint ?? ""),
    endingHook: String(plan.endingHook ?? ""),
  };
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [project] = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  const storyPlan = ((project.settings as Record<string, unknown>).storyPlan as Record<string, unknown> | undefined) ?? {};
  if (["story.volumes.generate", "story.rolling.plan"].includes(parsed.data.taskType) && storyPlan.schemaVersion !== 2) {
    return NextResponse.json({ error: "STORY_PLAN_V2_REQUIRED", message: "请先在大纲中保存最新结构的故事总纲。" }, { status: 409 });
  }
  const [run] = await db.insert(generationRuns).values({ projectId: project.id, taskType: parsed.data.taskType, status: "queued", userInstruction: parsed.data.brief, inputManifest: { approvalStatus: "not_generated" } }).returning();
  return NextResponse.json(run, { status: 202 });
}

export async function PATCH(request: Request) {
  const parsed = acceptSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, parsed.data.runId)).limit(1);
  if (!run || run.status !== "completed" || !run.parsedOutput) return NextResponse.json({ error: "RUN_NOT_READY" }, { status: 409 });
  const manifest = run.inputManifest as Record<string, unknown>;
  if (manifest.approvalStatus === "accepted") return NextResponse.json({ error: "ALREADY_ACCEPTED" }, { status: 409 });
  const output = run.parsedOutput as Record<string, unknown>;
  if (run.taskType === "story.structure.coordinate") return NextResponse.json({ error: "LEGACY_PLAN_UNSUPPORTED", message: "旧版联合规划结果已停止支持，请重新生成滚动规划。" }, { status: 409 });
  if (run.taskType === "story.rolling.plan" && (output.schemaVersion !== 2 || output.acceptanceAllowed !== true || !output.activeArc || !Array.isArray(output.volumes) || !output.volumes.length)) return NextResponse.json({ error: "ROLLING_PLAN_NOT_ACCEPTABLE", message: "滚动规划不是完整的 v2 结构。" }, { status: 409 });

  await db.transaction(async (tx) => {
    if (run.taskType === "story.plan") {
      const [project] = await tx.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
      if (!project) throw new Error("Project not found");
      // 总纲作为正式设置文档保存；接受新总纲时不改动已有章节正文。
      await tx.update(projects).set({ settings: { ...project.settings, storyPlan: { ...output, schemaVersion: 2 } }, updatedAt: new Date() }).where(eq(projects.id, project.id));
      const [firstVolume] = await tx.select().from(volumes).where(eq(volumes.projectId, project.id)).orderBy(asc(volumes.position)).limit(1);
      const firstPlan = Array.isArray(output.volumes) ? output.volumes[0] as Record<string, unknown> | undefined : undefined;
      if (firstVolume && firstPlan) await tx.update(volumes).set({ ...volumePlanValues(firstPlan, firstVolume.position), updatedAt: new Date() }).where(eq(volumes.id, firstVolume.id));
    } else if (run.taskType === "story.volumes.generate") {
      const [project] = await tx.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
      if (!project) throw new Error("Project not found");
      const plans = Array.isArray(output.volumes) ? output.volumes as Array<Record<string, unknown>> : [];
      const settings = project.settings as Record<string, unknown>;
      const storyPlan = (settings.storyPlan as Record<string, unknown> | undefined) ?? {};
      // 接受分卷草案只更新正式总纲中的分卷部分，保留用户已确认的其他总纲字段。
      await tx.update(projects).set({ settings: { ...settings, storyPlan: { ...storyPlan, volumes: plans } }, updatedAt: new Date() }).where(eq(projects.id, project.id));
      for (let index = 0; index < plans.length; index += 1) {
        const plan = plans[index];
        const values = volumePlanValues(plan, index + 1);
        await tx.insert(volumes).values({ projectId: project.id, ...values }).onConflictDoUpdate({ target: [volumes.projectId, volumes.position], set: { ...values, updatedAt: new Date() } });
      }
    } else if (run.taskType === "story.rolling.plan") {
      const [project] = await tx.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
      if (!project) throw new Error("Project not found");
      const cycleInfo = output.planningCycle as Record<string, unknown>;
      const horizon = cycleInfo.horizon && typeof cycleInfo.horizon === "object" ? cycleInfo.horizon as Record<string, unknown> : { detailedVolumes: 1, previewVolumes: 1, detailedChapters: 5 };
      // 只保留最新规划周期。删除旧周期会级联清理旧故事阶段和候选 Placement，
      // 但 volumes 使用 set null，因此不会删除其下已有章节正文。
      await tx.delete(planningCycles).where(eq(planningCycles.projectId, project.id));
      const [cycle] = await tx.insert(planningCycles).values({ projectId: project.id, cycleNumber: Number(cycleInfo.cycleNumber) || 1, triggerType: String(cycleInfo.triggerType ?? "manual"), status: "confirmed", currentStage: "active_volume", planningHorizon: horizon, inputSnapshot: { storyPlan: (project.settings as Record<string, unknown>).storyPlan ?? {} }, outputSummary: output, validationResult: output.validation && typeof output.validation === "object" ? output.validation as Record<string, unknown> : {}, confirmedAt: new Date() }).returning();
      const arcPlan = output.activeArc as Record<string, unknown>;
      const [arc] = await tx.insert(storyArcs).values({ projectId: project.id, planningCycleId: cycle.id, position: 1, title: String(arcPlan.title ?? "当前故事阶段"), objective: String(arcPlan.objective ?? ""), centralConflict: String(arcPlan.centralConflict ?? ""), entryState: arcPlan.entryState && typeof arcPlan.entryState === "object" ? arcPlan.entryState as Record<string, unknown> : {}, exitState: arcPlan.exitState && typeof arcPlan.exitState === "object" ? arcPlan.exitState as Record<string, unknown> : {}, endingDirection: String(arcPlan.endingDirection ?? ""), futureDirections: Array.isArray(arcPlan.futureDirections) ? arcPlan.futureDirections.map(String) : [], status: "active" }).returning();
      await tx.insert(storyStateSnapshots).values({ projectId: project.id, planningCycleId: cycle.id, snapshotType: "cycle_start", storylineStates: [], foreshadowingStates: [], unresolvedConflicts: [], readerPromises: [], recentEvents: [] });
      const volumePlans = (output.volumes as Array<Record<string, unknown>>).slice(0, 2);
      const volumeIds = new Map<string, string>();
      for (let index = 0; index < volumePlans.length; index += 1) {
        const plan = volumePlans[index]; const values = volumePlanValues(plan, index + 1);
        const [saved] = await tx.insert(volumes).values({ projectId: project.id, planningCycleId: cycle.id, storyArcId: arc.id, planningStatus: index === 0 ? "active" : "preview", confidence: Math.max(0, Math.min(100, Number(plan.confidence) || (index === 0 ? 90 : 60))), ...values }).onConflictDoUpdate({ target: [volumes.projectId, volumes.position], set: { planningCycleId: cycle.id, storyArcId: arc.id, planningStatus: index === 0 ? "active" : "preview", confidence: Math.max(0, Math.min(100, Number(plan.confidence) || (index === 0 ? 90 : 60))), ...values, updatedAt: new Date() } }).returning();
        volumeIds.set(String(plan.volumeKey ?? (index === 0 ? "active" : "preview")), saved.id);
      }
      await tx.delete(foreshadowings).where(eq(foreshadowings.projectId, project.id));
      const threadIds = new Map<string, string>();
      const threads = Array.isArray(output.foreshadowings) ? output.foreshadowings as Array<Record<string, unknown>> : [];
      for (let index = 0; index < threads.length; index += 1) {
        const plan = threads[index]; const [saved] = await tx.insert(foreshadowings).values({ projectId: project.id, title: String(plan.title ?? `伏笔${index + 1}`).slice(0, 200), truth: String(plan.truth ?? "待规划"), hiddenInformation: Array.isArray(plan.hiddenInformation) ? plan.hiddenInformation.map(String) : [], purpose: String(plan.purpose ?? ""), importance: plan.importance === "core" ? "core" : "supporting", revealPattern: String(plan.revealPattern ?? "progressive").slice(0, 40), commitmentLevel: plan.commitmentLevel === "commitment" ? "commitment" : "candidate", targetPayoffStage: String(plan.targetPayoffStage ?? ""), status: "planned" }).returning(); threadIds.set(String(plan.key ?? `foreshadowing_${index + 1}`), saved.id);
      }
      const placements = Array.isArray(output.placements) ? output.placements as Array<Record<string, unknown>> : [];
      const placementRows = placements.flatMap((plan, index) => { const foreshadowingId = threadIds.get(String(plan.foreshadowingKey)); const volumeId = volumeIds.get(String(plan.volumeKey)); if (!foreshadowingId || !volumeId) return []; return [{ projectId: project.id, planningCycleId: cycle.id, foreshadowingId, volumeId, position: Number(plan.position) || index + 1, placementType: String(plan.placementType ?? "reinforce"), required: plan.required === true, narrativeIntent: String(plan.narrativeIntent ?? ""), allowedInformation: plan.allowedInformation && typeof plan.allowedInformation === "object" ? plan.allowedInformation as Record<string, unknown> : {}, forbiddenInformation: plan.forbiddenInformation && typeof plan.forbiddenInformation === "object" ? plan.forbiddenInformation as Record<string, unknown> : {}, planningStatus: plan.planningStatus === "commitment" ? "commitment" : "candidate", status: "planned" as const }]; });
      if (placementRows.length) await tx.insert(foreshadowingPlacements).values(placementRows);
    } else if (run.taskType === "story.structure.coordinate") {
      const [project] = await tx.select().from(projects).where(eq(projects.id, run.projectId)).limit(1);
      if (!project) throw new Error("Project not found");
      const volumePlans = Array.isArray(output.volumes) ? output.volumes as Array<Record<string, unknown>> : [];
      const threadPlans = Array.isArray(output.foreshadowings) ? output.foreshadowings as Array<Record<string, unknown>> : [];
      const placementPlans = Array.isArray(output.placements) ? output.placements as Array<Record<string, unknown>> : [];
      if (!volumePlans.length || !threadPlans.length) throw new Error("FinalPlan 缺少分卷或伏笔");

      const volumeIds = new Map<string, string>();
      for (let index = 0; index < volumePlans.length; index += 1) {
        const plan = volumePlans[index]; const values = volumePlanValues(plan, index + 1);
        const [saved] = await tx.insert(volumes).values({ projectId: project.id, ...values }).onConflictDoUpdate({ target: [volumes.projectId, volumes.position], set: { ...values, updatedAt: new Date() } }).returning();
        volumeIds.set(String(plan.volumeKey ?? `volume_${index + 1}`), saved.id);
      }
      // FinalPlan 是联合规划的完整快照，接受时用新伏笔集合替换旧集合。
      await tx.delete(foreshadowings).where(eq(foreshadowings.projectId, project.id));
      const threadIds = new Map<string, string>();
      for (let index = 0; index < threadPlans.length; index += 1) {
        const plan = threadPlans[index];
        const [saved] = await tx.insert(foreshadowings).values({ projectId: project.id, title: String(plan.title ?? `伏笔${index + 1}`).slice(0, 200), truth: String(plan.truth ?? "待规划"), hiddenInformation: Array.isArray(plan.hiddenInformation) ? plan.hiddenInformation.map(String) : [], purpose: String(plan.purpose ?? ""), importance: plan.importance === "core" ? "core" : "supporting", revealPattern: String(plan.revealPattern ?? "progressive").slice(0, 40), status: "planned" }).returning();
        threadIds.set(String(plan.key ?? `foreshadowing_${index + 1}`), saved.id);
      }
      const allowedTypes = new Set(["seed", "reinforce", "misdirect", "reveal", "payoff", "echo"]);
      const usedPositions = new Map<string, Set<number>>();
      const rows = placementPlans.flatMap((plan) => {
        const foreshadowingId = threadIds.get(String(plan.foreshadowingKey)); const volumeId = volumeIds.get(String(plan.volumeKey));
        // 无效引用无法安全入库，保留伏笔本身供用户在故事管理中手动补充落点。
        if (!foreshadowingId || !volumeId) return [];
        const used = usedPositions.get(foreshadowingId) ?? new Set<number>();
        let position = Math.max(1, Number(plan.position) || 1); while (used.has(position)) position += 1;
        used.add(position); usedPositions.set(foreshadowingId, used);
        return [{ projectId: project.id, foreshadowingId, volumeId, position, placementType: allowedTypes.has(String(plan.placementType)) ? String(plan.placementType) : "reinforce", required: plan.required === true, narrativeIntent: String(plan.narrativeIntent ?? ""), allowedInformation: plan.allowedInformation && typeof plan.allowedInformation === "object" && !Array.isArray(plan.allowedInformation) ? plan.allowedInformation as Record<string, unknown> : {}, forbiddenInformation: plan.forbiddenInformation && typeof plan.forbiddenInformation === "object" && !Array.isArray(plan.forbiddenInformation) ? plan.forbiddenInformation as Record<string, unknown> : {}, status: "planned" as const }];
      });
      if (rows.length) await tx.insert(foreshadowingPlacements).values(rows);
      const settings = project.settings as Record<string, unknown>; const storyPlan = (settings.storyPlan as Record<string, unknown> | undefined) ?? {};
      await tx.update(projects).set({ settings: { ...settings, storyPlan: { ...storyPlan, volumes: volumePlans } }, updatedAt: new Date() }).where(eq(projects.id, project.id));
    } else if (run.taskType === "story.bible.generate") {
      const people = Array.isArray(output.characters) ? output.characters as Array<Record<string, unknown>> : [];
      if (people.length) await tx.insert(characters).values(people.filter((item) => item.name).map((item) => ({ projectId: run.projectId, name: String(item.name), coreDesire: String(item.coreDesire ?? ""), externalGoal: String(item.externalGoal ?? ""), internalNeed: String(item.internalNeed ?? ""), behaviorConstraints: Array.isArray(item.behaviorConstraints) ? item.behaviorConstraints.map(String) : [], profile: { gender: String(item.gender ?? ""), age: typeof item.age === "number" ? item.age : String(item.age ?? ""), role: String(item.role ?? ""), personality: String(item.personality ?? ""), appearance: String(item.appearance ?? ""), background: String(item.background ?? "") } }))).onConflictDoNothing();
      const groups = [["rule", output.worldRules], ["location", output.locations], ["faction", output.factions], ["item", output.items], ["ability", output.abilities]] as const;
      const entries = groups.flatMap(([entryType, value]) => Array.isArray(value) ? (value as Array<Record<string, unknown>>).filter((item) => item.name).map((item) => ({ projectId: run.projectId, entryType, name: String(item.name), summary: String(item.summary ?? item.description ?? ""), strength: item.strength === "hard" ? "hard" as const : "soft" as const, sourceType: "ai" })) : []);
      if (entries.length) await tx.insert(storyBibleEntries).values(entries).onConflictDoNothing();
    } else throw new Error("Unsupported asset task");
    await tx.update(generationRuns).set({ inputManifest: { ...manifest, approvalStatus: "accepted", acceptedAt: new Date().toISOString() }, updatedAt: new Date() }).where(eq(generationRuns.id, run.id));
  });
  return NextResponse.json({ ok: true });
}
