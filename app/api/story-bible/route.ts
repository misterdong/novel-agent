import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { characterRelationships, characters, projects, storyBibleEntries, storyItems } from "@/db/schema";

const createSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entry"), projectId: z.string().uuid(), entryType: z.string().min(1).max(40), name: z.string().trim().min(1).max(200), summary: z.string().max(5000), strength: z.enum(["soft", "hard"]) }),
  z.object({ kind: z.literal("character"), projectId: z.string().uuid(), name: z.string().trim().min(1).max(120), aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]), coreDesire: z.string().max(2000), externalGoal: z.string().max(2000), internalNeed: z.string().max(2000).default(""), behaviorConstraints: z.array(z.string().trim().min(1).max(500)).max(30).default([]), profile: z.record(z.string(), z.unknown()).default({}) }),
  z.object({ kind: z.literal("relationship"), projectId: z.string().uuid(), characterAId: z.string().uuid(), characterBId: z.string().uuid(), relationType: z.string().trim().min(1).max(60), status: z.string().trim().min(1).max(60), aToBAttitude: z.string().max(2000), bToAAttitude: z.string().max(2000), description: z.string().max(5000), nextDirection: z.string().max(2000) }),
]);

const updateCharacterSchema = z.object({ kind: z.literal("character"), id: z.string().uuid(), name: z.string().trim().min(1).max(120), aliases: z.array(z.string().trim().min(1).max(120)).max(20), coreDesire: z.string().max(2000), externalGoal: z.string().max(2000), internalNeed: z.string().max(2000), behaviorConstraints: z.array(z.string().trim().min(1).max(500)).max(30), profile: z.record(z.string(), z.unknown()) });
const updateRelationshipSchema = z.object({ kind: z.literal("relationship"), id: z.string().uuid(), relationType: z.string().trim().min(1).max(60), status: z.string().trim().min(1).max(60), aToBAttitude: z.string().max(2000), bToAAttitude: z.string().max(2000), description: z.string().max(5000), nextDirection: z.string().max(2000) });

export async function GET(request: Request) {
  const requestedId = new URL(request.url).searchParams.get("projectId");
  const [project] = requestedId
    ? await db.select().from(projects).where(eq(projects.id, requestedId)).limit(1)
    : await db.select().from(projects).where(eq(projects.status, "active")).limit(1);
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });

  const [entries, people, items, relationships] = await Promise.all([
    db.select().from(storyBibleEntries).where(eq(storyBibleEntries.projectId, project.id)).orderBy(asc(storyBibleEntries.entryType), asc(storyBibleEntries.name)),
    db.select().from(characters).where(eq(characters.projectId, project.id)).orderBy(asc(characters.name)),
    db.select().from(storyItems).where(eq(storyItems.projectId, project.id)).orderBy(asc(storyItems.name)),
    db.select().from(characterRelationships).where(eq(characterRelationships.projectId, project.id)).orderBy(asc(characterRelationships.createdAt)),
  ]);
  return NextResponse.json({ project: { id: project.id, title: project.title }, entries, characters: people, items, relationships });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  // 人物使用独立表保存，因为人物认知和人物关系都需要引用稳定的人物 ID；
  // 普通世界设定不需要这套身份模型。
  if (parsed.data.kind === "character") {
    const value = { projectId: parsed.data.projectId, name: parsed.data.name, aliases: parsed.data.aliases, coreDesire: parsed.data.coreDesire, externalGoal: parsed.data.externalGoal, internalNeed: parsed.data.internalNeed, behaviorConstraints: parsed.data.behaviorConstraints, profile: parsed.data.profile };
    const [created] = await db.insert(characters).values(value).returning();
    return NextResponse.json(created, { status: 201 });
  }
  if (parsed.data.kind === "relationship") {
    if (parsed.data.characterAId === parsed.data.characterBId) return NextResponse.json({ error: "SAME_CHARACTER" }, { status: 400 });
    const { kind: _kind, ...value } = parsed.data;
    const [created] = await db.insert(characterRelationships).values(value).returning();
    return NextResponse.json(created, { status: 201 });
  }
  const value = { projectId: parsed.data.projectId, entryType: parsed.data.entryType, name: parsed.data.name, summary: parsed.data.summary, strength: parsed.data.strength };
  const [created] = await db.insert(storyBibleEntries).values(value).returning();
  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const parsed = body.kind === "relationship" ? updateRelationshipSchema.safeParse(body) : updateCharacterSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  const { id, kind: _kind, ...values } = parsed.data;
  const [updated] = parsed.data.kind === "relationship"
    ? await db.update(characterRelationships).set({ ...values, updatedAt: new Date() }).where(eq(characterRelationships.id, id)).returning()
    : await db.update(characters).set({ ...values, updatedAt: new Date() }).where(eq(characters.id, id)).returning();
  return updated ? NextResponse.json(updated) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}
