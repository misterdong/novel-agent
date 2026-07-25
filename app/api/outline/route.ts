import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { chapters, planningCycles, plotEvents, projects, scenes, storylineNodes, storylines, volumes } from "@/db/schema";

const updateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("chapter"), chapterId: z.string().uuid(), outline: z.record(z.unknown()) }),
  z.object({ kind: z.literal("storyPlan"), projectId: z.string().uuid(), storyPlan: z.record(z.unknown()) }),
  z.object({ kind: z.literal("volume"), volumeId: z.string().uuid(), objective: z.string().max(5000), conflict: z.string().max(5000), turningPoint: z.string().max(5000), endingHook: z.string().max(5000) }),
  z.object({ kind: z.literal("storyline"), storylineId: z.string().uuid(), name: z.string().trim().min(1).max(160), storylineType: z.string().max(40), summary: z.string().max(5000), coreQuestion: z.string().max(5000), initialState: z.string().max(5000), targetOutcome: z.string().max(5000), coreConflict: z.string().max(5000), currentProgress: z.string().max(5000), nextPlan: z.string().max(5000), completionCriteria: z.string().max(5000), priority: z.enum(["core", "important", "supporting"]), status: z.enum(["planned", "active", "paused", "completed", "abandoned"]) }),
  z.object({ kind: z.literal("storylineNode"), nodeId: z.string().uuid(), title: z.string().trim().min(1).max(200), objective: z.string().max(5000), entryCondition: z.string().max(5000), result: z.string().max(5000), status: z.enum(["planned", "foreshadowed", "completed", "cancelled"]) }),
]);
const createSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("scene"), chapterId: z.string().uuid(), title: z.string().trim().min(1).max(200), objective: z.string().max(3000), conflict: z.string().max(3000), outcome: z.string().max(3000), targetWords: z.number().int().min(100).max(10000) }),
  z.object({ kind: z.literal("storyline"), projectId: z.string().uuid(), name: z.string().trim().min(1).max(160), storylineType: z.string().max(40), summary: z.string().max(5000), coreQuestion: z.string().max(5000).default(""), initialState: z.string().max(5000).default(""), targetOutcome: z.string().max(5000).default(""), coreConflict: z.string().max(5000).default(""), priority: z.enum(["core", "important", "supporting"]).default("important") }),
  z.object({ kind: z.literal("storylineNode"), storylineId: z.string().uuid(), title: z.string().trim().min(1).max(200), objective: z.string().max(5000), entryCondition: z.string().max(5000), result: z.string().max(5000) }),
  z.object({ kind: z.literal("event"), projectId: z.string().uuid(), title: z.string().trim().min(1).max(200), description: z.string().max(5000), cause: z.string().max(5000), consequence: z.string().max(5000), storylineId: z.string().uuid().nullable() }),
]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const requestedChapterId = params.get("chapterId");
  const requestedProjectId = params.get("projectId");
  const [project] = requestedProjectId
    ? await db.select().from(projects).where(eq(projects.id, requestedProjectId)).limit(1)
    : await db.select().from(projects).where(eq(projects.status, "active")).limit(1);
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  const volumeRows = await db.select().from(volumes).where(eq(volumes.projectId, project.id)).orderBy(asc(volumes.position));
  const volume = volumeRows[0];
  const [storylineRows, storylineNodeRows, eventRows, cycleRows] = await Promise.all([
    db.select().from(storylines).where(eq(storylines.projectId, project.id)).orderBy(asc(storylines.position)),
    db.select().from(storylineNodes).where(eq(storylineNodes.projectId, project.id)).orderBy(asc(storylineNodes.position)),
    db.select().from(plotEvents).where(eq(plotEvents.projectId, project.id)).orderBy(asc(plotEvents.position)),
    db.select().from(planningCycles).where(eq(planningCycles.projectId, project.id)).orderBy(desc(planningCycles.cycleNumber)).limit(1),
  ]);
  const rollingPlanning = cycleRows[0]?.outputSummary ?? null;
  // 分卷可以被全部删除，但故事总纲、故事线和关键事件仍属于项目，不能因此返回 404。
  if (!volume) return NextResponse.json({ project, volume: null, volumes: [], storyPlan: (project.settings as Record<string, unknown>).storyPlan ?? {}, rollingPlanning, storylines: storylineRows, storylineNodes: storylineNodeRows, events: eventRows, chapters: [], activeChapter: null, scenes: [] });
  const chapterRows = await db.select().from(chapters).where(eq(chapters.volumeId, volume.id)).orderBy(asc(chapters.position));
  const active = chapterRows.find((item) => item.id === requestedChapterId) ?? chapterRows[0];
  const sceneRows = active ? await db.select().from(scenes).where(eq(scenes.chapterId, active.id)).orderBy(asc(scenes.position)) : [];
  return NextResponse.json({ project, volume, volumes: volumeRows, storyPlan: (project.settings as Record<string, unknown>).storyPlan ?? {}, rollingPlanning, storylines: storylineRows, storylineNodes: storylineNodeRows, events: eventRows, chapters: chapterRows, activeChapter: active, scenes: sceneRows });
}

export async function PATCH(request: Request) {
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const data = parsed.data;
  if (data.kind === "storyPlan") {
    const [project] = await db.select().from(projects).where(eq(projects.id, data.projectId)).limit(1);
    if (!project) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    // schemaVersion 是新规划入口的硬边界；旧结构不再由生成流程自动推断或兼容。
    const [updated] = await db.update(projects).set({ settings: { ...project.settings, storyPlan: { ...data.storyPlan, schemaVersion: 2 } }, updatedAt: new Date() }).where(eq(projects.id, project.id)).returning();
    return NextResponse.json(updated);
  }
  if (data.kind === "volume") {
    const [updated] = await db.update(volumes).set({ objective: data.objective, conflict: data.conflict, turningPoint: data.turningPoint, endingHook: data.endingHook, updatedAt: new Date() }).where(eq(volumes.id, data.volumeId)).returning();
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (data.kind === "storyline") {
    const values = { name: data.name, storylineType: data.storylineType, summary: data.summary, coreQuestion: data.coreQuestion, initialState: data.initialState, targetOutcome: data.targetOutcome, coreConflict: data.coreConflict, currentProgress: data.currentProgress, nextPlan: data.nextPlan, completionCriteria: data.completionCriteria, priority: data.priority, status: data.status };
    const [updated] = await db.update(storylines).set({ ...values, updatedAt: new Date() }).where(eq(storylines.id, data.storylineId)).returning();
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (data.kind === "storylineNode") {
    const values = { title: data.title, objective: data.objective, entryCondition: data.entryCondition, result: data.result, status: data.status };
    const [updated] = await db.update(storylineNodes).set({ ...values, updatedAt: new Date() }).where(eq(storylineNodes.id, data.nodeId)).returning();
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const [updated] = await db.update(chapters).set({ outline: data.outline, updatedAt: new Date() }).where(eq(chapters.id, data.chapterId)).returning();
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const data = parsed.data;
  if (data.kind === "storyline") {
    const [last] = await db.select({ position: storylines.position }).from(storylines).where(eq(storylines.projectId, data.projectId)).orderBy(desc(storylines.position)).limit(1);
    const [created] = await db.insert(storylines).values({ projectId: data.projectId, name: data.name, storylineType: data.storylineType, summary: data.summary, coreQuestion: data.coreQuestion, initialState: data.initialState, targetOutcome: data.targetOutcome, coreConflict: data.coreConflict, priority: data.priority, position: (last?.position ?? 0) + 1 }).returning();
    return NextResponse.json(created, { status: 201 });
  }
  if (data.kind === "storylineNode") {
    const [storyline] = await db.select().from(storylines).where(eq(storylines.id, data.storylineId)).limit(1);
    if (!storyline) return NextResponse.json({ error: "STORYLINE_NOT_FOUND" }, { status: 404 });
    const [last] = await db.select({ position: storylineNodes.position }).from(storylineNodes).where(eq(storylineNodes.storylineId, storyline.id)).orderBy(desc(storylineNodes.position)).limit(1);
    const [created] = await db.insert(storylineNodes).values({ projectId: storyline.projectId, storylineId: storyline.id, position: (last?.position ?? 0) + 1, title: data.title, objective: data.objective, entryCondition: data.entryCondition, result: data.result }).returning();
    return NextResponse.json(created, { status: 201 });
  }
  if (data.kind === "event") {
    const [last] = await db.select({ position: plotEvents.position }).from(plotEvents).where(eq(plotEvents.projectId, data.projectId)).orderBy(desc(plotEvents.position)).limit(1);
    const [created] = await db.insert(plotEvents).values({ projectId: data.projectId, title: data.title, description: data.description, cause: data.cause, consequence: data.consequence, storylineId: data.storylineId, position: (last?.position ?? 0) + 1 }).returning();
    return NextResponse.json(created, { status: 201 });
  }
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, data.chapterId)).limit(1);
  if (!chapter) return NextResponse.json({ error: "CHAPTER_NOT_FOUND" }, { status: 404 });
  const [last] = await db.select({ position: scenes.position }).from(scenes).where(eq(scenes.chapterId, chapter.id)).orderBy(desc(scenes.position)).limit(1);
  // Positions are server-assigned to keep scene ordering deterministic for AI context assembly.
  const [created] = await db.insert(scenes).values({ projectId: chapter.projectId, chapterId: chapter.id, position: (last?.position ?? 0) + 1, title: data.title, targetWords: data.targetWords, outline: { objective: data.objective, conflict: data.conflict, outcome: data.outcome } }).returning();
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const id = params.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  if (kind === "storylineNode") {
    const [deleted] = await db.delete(storylineNodes).where(eq(storylineNodes.id, id)).returning();
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (kind === "storyline") {
    const [deleted] = await db.delete(storylines).where(eq(storylines.id, id)).returning();
    return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ error: "INVALID_KIND" }, { status: 400 });
}
