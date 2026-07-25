import { and, asc, eq, gt, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { scenes } from "@/db/schema";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["draft", "confirmed", "writing", "completed"]).optional(),
  targetWords: z.number().int().min(100).max(10000).optional(),
  outline: z.record(z.unknown()).optional(),
  move: z.enum(["up", "down"]).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [current] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  if (!current) return NextResponse.json({ error: "SCENE_NOT_FOUND" }, { status: 404 });

  if (parsed.data.move) {
    const direction = parsed.data.move;
    const candidates = await db.select().from(scenes).where(and(
      eq(scenes.chapterId, current.chapterId),
      direction === "up" ? lt(scenes.position, current.position) : gt(scenes.position, current.position),
    )).orderBy(direction === "up" ? asc(scenes.position) : asc(scenes.position));
    const adjacent = direction === "up" ? candidates.at(-1) : candidates[0];
    if (!adjacent) return NextResponse.json(current);
    await db.transaction(async (tx) => {
      // Use a temporary position to satisfy the chapter/position unique index while swapping.
      await tx.update(scenes).set({ position: 0 }).where(eq(scenes.id, current.id));
      await tx.update(scenes).set({ position: current.position }).where(eq(scenes.id, adjacent.id));
      await tx.update(scenes).set({ position: adjacent.position }).where(eq(scenes.id, current.id));
    });
  } else {
    const { move: _, ...changes } = parsed.data;
    void _;
    await db.update(scenes).set({ ...changes, updatedAt: new Date() }).where(eq(scenes.id, sceneId));
  }
  const [updated] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, context: { params: Promise<{ sceneId: string }> }) {
  const { sceneId } = await context.params;
  const [deleted] = await db.delete(scenes).where(eq(scenes.id, sceneId)).returning();
  if (!deleted) return NextResponse.json({ error: "SCENE_NOT_FOUND" }, { status: 404 });
  // Gaps are harmless because display order is positional, but compacting keeps future
  // inserts and AI context manifests predictable.
  const remaining = await db.select().from(scenes).where(eq(scenes.chapterId, deleted.chapterId)).orderBy(asc(scenes.position));
  await db.transaction(async (tx) => {
    for (let index = 0; index < remaining.length; index += 1) {
      await tx.update(scenes).set({ position: -(index + 1) }).where(eq(scenes.id, remaining[index].id));
    }
    for (let index = 0; index < remaining.length; index += 1) {
      await tx.update(scenes).set({ position: index + 1 }).where(eq(scenes.id, remaining[index].id));
    }
  });
  return NextResponse.json({ deleted: true });
}
