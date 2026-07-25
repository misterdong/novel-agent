import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { autopilotRuns, chapters } from "@/db/schema";

const updateChapterSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(["draft", "confirmed", "writing", "completed"]).optional(),
}).refine((value) => value.title !== undefined || value.status !== undefined, "No changes supplied");

export async function PATCH(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const parsed = updateChapterSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const [chapter] = await db.update(chapters)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(chapters.id, chapterId))
    .returning();
  if (!chapter) return NextResponse.json({ error: "CHAPTER_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(chapter);
}

export async function DELETE(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  if (!chapter) return NextResponse.json({ error: "CHAPTER_NOT_FOUND" }, { status: 404 });
  const [activeRun] = await db.select({ id: autopilotRuns.id }).from(autopilotRuns).where(and(eq(autopilotRuns.chapterId, chapterId), inArray(autopilotRuns.status, ["queued", "running", "paused"]))).limit(1);
  if (activeRun) return NextResponse.json({ error: "AUTOPILOT_ACTIVE", message: "该章节仍由自动创作任务处理，请先终止任务。" }, { status: 409 });
  const siblings = await db.select().from(chapters).where(eq(chapters.volumeId, chapter.volumeId)).orderBy(asc(chapters.position));
  if (siblings.length <= 1) return NextResponse.json({ error: "LAST_CHAPTER", message: "每个分卷至少需要保留一个章节。" }, { status: 409 });
  const nextChapter = siblings.find((item) => item.position > chapter.position) ?? siblings.findLast((item) => item.position < chapter.position);
  await db.transaction(async (tx) => {
    // Related scenes, versions, reviews and summaries use cascading foreign keys.
    await tx.delete(chapters).where(eq(chapters.id, chapter.id));
    for (const sibling of siblings.filter((item) => item.position > chapter.position)) {
      await tx.update(chapters).set({ position: sibling.position - 1, updatedAt: new Date() }).where(eq(chapters.id, sibling.id));
    }
  });
  return NextResponse.json({ ok: true, nextChapterId: nextChapter?.id ?? null });
}
