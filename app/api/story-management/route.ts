import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { characterKnowledge, characters, chapters, foreshadowingPlacements, foreshadowings, projects, timelineEvents, volumes } from "@/db/schema";

const foreshadowingStatusSchema = z.enum(["planned", "active", "revealed", "paid_off", "abandoned"]);
const placementStatusSchema = z.enum(["planned", "assigned", "written", "verified", "cancelled"]);
const placementTypeSchema = z.enum(["seed", "reinforce", "misdirect", "reveal", "payoff", "echo"]);
const knowledgeSchema = z.enum(["knows", "believes", "suspects", "does_not_know"]);

const createSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("foreshadowing"), projectId: z.string().uuid(), title: z.string().trim().min(1).max(200), truth: z.string().max(10000), hiddenInformation: z.array(z.string().max(2000)).max(50), purpose: z.string().max(10000), importance: z.enum(["core", "supporting"]), revealPattern: z.enum(["progressive", "delayed", "misdirection", "layered", "false_answer_then_truth"]), status: foreshadowingStatusSchema.default("planned") }),
  z.object({ kind: z.literal("placement"), projectId: z.string().uuid(), foreshadowingId: z.string().uuid(), volumeId: z.string().uuid(), chapterId: z.string().uuid().nullable(), placementType: placementTypeSchema, required: z.boolean(), narrativeIntent: z.string().max(10000), allowedInformation: z.record(z.unknown()), forbiddenInformation: z.record(z.unknown()) }),
  z.object({ kind: z.literal("timeline"), projectId: z.string().uuid(), title: z.string().trim().min(1).max(200), description: z.string().max(5000), timeKind: z.string().max(30).default("relative"), relativeDay: z.number().int().nullable(), locationName: z.string().max(200) }),
  z.object({ kind: z.literal("knowledge"), projectId: z.string().uuid(), characterId: z.string().uuid(), proposition: z.string().trim().min(1).max(5000), state: knowledgeSchema, sourceChapterId: z.string().uuid().nullable().optional() }),
]);

const updateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("foreshadowing"), id: z.string().uuid(), status: foreshadowingStatusSchema, title: z.string().trim().min(1).max(200).optional(), truth: z.string().max(10000).optional(), hiddenInformation: z.array(z.string().max(2000)).max(50).optional(), purpose: z.string().max(10000).optional(), importance: z.enum(["core", "supporting"]).optional(), revealPattern: z.enum(["progressive", "delayed", "misdirection", "layered", "false_answer_then_truth"]).optional() }),
  z.object({ kind: z.literal("placement"), id: z.string().uuid(), status: placementStatusSchema, volumeId: z.string().uuid().optional(), chapterId: z.string().uuid().nullable().optional(), placementType: placementTypeSchema.optional(), required: z.boolean().optional(), narrativeIntent: z.string().max(10000).optional(), allowedInformation: z.record(z.unknown()).optional(), forbiddenInformation: z.record(z.unknown()).optional() }),
  z.object({ kind: z.literal("knowledge"), id: z.string().uuid(), state: knowledgeSchema }),
]);

export async function GET(request: Request) {
  const requestedId = new URL(request.url).searchParams.get("projectId");
  const [project] = requestedId
    ? await db.select().from(projects).where(eq(projects.id, requestedId)).limit(1)
    : await db.select().from(projects).where(eq(projects.status, "active")).limit(1);
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });

  const [threads, placements, volumeRows, chapterRows, events, people, knowledge] = await Promise.all([
    db.select().from(foreshadowings).where(eq(foreshadowings.projectId, project.id)).orderBy(asc(foreshadowings.createdAt)),
    db.select().from(foreshadowingPlacements).where(eq(foreshadowingPlacements.projectId, project.id)).orderBy(asc(foreshadowingPlacements.position)),
    db.select().from(volumes).where(eq(volumes.projectId, project.id)).orderBy(asc(volumes.position)),
    db.select().from(chapters).where(eq(chapters.projectId, project.id)).orderBy(asc(chapters.position)),
    db.select().from(timelineEvents).where(eq(timelineEvents.projectId, project.id)).orderBy(asc(timelineEvents.relativeDay), asc(timelineEvents.createdAt)),
    db.select().from(characters).where(eq(characters.projectId, project.id)).orderBy(asc(characters.name)),
    db.select().from(characterKnowledge).where(eq(characterKnowledge.projectId, project.id)).orderBy(asc(characterKnowledge.createdAt)),
  ]);
  return NextResponse.json({ project: { id: project.id, title: project.title }, foreshadowings: threads, placements, volumes: volumeRows, chapters: chapterRows, timelineEvents: events, characters: people, knowledge });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  if (data.kind === "foreshadowing") {
    const [created] = await db.insert(foreshadowings).values({ projectId: data.projectId, title: data.title, truth: data.truth, hiddenInformation: data.hiddenInformation, purpose: data.purpose, importance: data.importance, revealPattern: data.revealPattern, status: data.status }).returning();
    return NextResponse.json(created, { status: 201 });
  }
  if (data.kind === "placement") {
    const [thread] = await db.select().from(foreshadowings).where(and(eq(foreshadowings.id, data.foreshadowingId), eq(foreshadowings.projectId, data.projectId))).limit(1);
    const [volume] = await db.select().from(volumes).where(and(eq(volumes.id, data.volumeId), eq(volumes.projectId, data.projectId))).limit(1);
    const [chapter] = data.chapterId ? await db.select().from(chapters).where(and(eq(chapters.id, data.chapterId), eq(chapters.volumeId, data.volumeId))).limit(1) : [];
    if (!thread || !volume || (data.chapterId && !chapter)) return NextResponse.json({ error: "INVALID_RELATION" }, { status: 409 });
    const [last] = await db.select({ position: foreshadowingPlacements.position }).from(foreshadowingPlacements).where(eq(foreshadowingPlacements.foreshadowingId, thread.id)).orderBy(desc(foreshadowingPlacements.position)).limit(1);
    const [created] = await db.insert(foreshadowingPlacements).values({ projectId: data.projectId, foreshadowingId: data.foreshadowingId, volumeId: data.volumeId, chapterId: data.chapterId, position: (last?.position ?? 0) + 1, placementType: data.placementType, required: data.required, narrativeIntent: data.narrativeIntent, allowedInformation: data.allowedInformation, forbiddenInformation: data.forbiddenInformation, status: data.chapterId ? "assigned" : "planned" }).returning();
    return NextResponse.json(created, { status: 201 });
  }
  if (data.kind === "timeline") {
    const [created] = await db.insert(timelineEvents).values({ projectId: data.projectId, title: data.title, description: data.description, timeKind: data.timeKind, relativeDay: data.relativeDay, locationName: data.locationName }).returning();
    return NextResponse.json(created, { status: 201 });
  }
  // 人物认知属于角色视角，不能未经审批提升为客观故事事实。
  const [created] = await db.insert(characterKnowledge).values({ projectId: data.projectId, characterId: data.characterId, proposition: data.proposition, state: data.state, sourceChapterId: data.sourceChapterId }).returning();
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  if (data.kind === "foreshadowing") {
    const values = { status: data.status, title: data.title, truth: data.truth, hiddenInformation: data.hiddenInformation, purpose: data.purpose, importance: data.importance, revealPattern: data.revealPattern };
    const [updated] = await db.update(foreshadowings).set({ ...values, updatedAt: new Date() }).where(eq(foreshadowings.id, data.id)).returning();
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (data.kind === "placement") {
    const [existing] = await db.select().from(foreshadowingPlacements).where(eq(foreshadowingPlacements.id, data.id)).limit(1);
    if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const volumeId = data.volumeId ?? existing.volumeId;
    const chapterId = data.chapterId === undefined ? existing.chapterId : data.chapterId;
    // 人工调整落点时仍校验章节必须属于所选分卷，避免修复动作制造新的悬空引用。
    const [volume] = await db.select().from(volumes).where(and(eq(volumes.id, volumeId), eq(volumes.projectId, existing.projectId))).limit(1);
    const [chapter] = chapterId ? await db.select().from(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.volumeId, volumeId))).limit(1) : [];
    if (!volume || (chapterId && !chapter)) return NextResponse.json({ error: "INVALID_RELATION" }, { status: 409 });
    const values = { status: data.status, placementType: data.placementType, required: data.required, narrativeIntent: data.narrativeIntent, allowedInformation: data.allowedInformation, forbiddenInformation: data.forbiddenInformation };
    const [updated] = await db.update(foreshadowingPlacements).set({ ...values, volumeId, chapterId, updatedAt: new Date() }).where(eq(foreshadowingPlacements.id, data.id)).returning();
    return NextResponse.json(updated);
  }
  const [updated] = await db.update(characterKnowledge).set({ state: data.state, updatedAt: new Date() }).where(eq(characterKnowledge.id, data.id)).returning();
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [deleted] = params.get("kind") === "placement"
    ? await db.delete(foreshadowingPlacements).where(eq(foreshadowingPlacements.id, id)).returning()
    : await db.delete(foreshadowings).where(eq(foreshadowings.id, id)).returning();
  return deleted ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
