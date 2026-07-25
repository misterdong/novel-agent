import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { chapters, manuscriptVersions } from "@/db/schema";

const restoreSchema = z.object({ versionId: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const versions = await db.select({
    id: manuscriptVersions.id,
    versionNo: manuscriptVersions.versionNo,
    wordCount: manuscriptVersions.wordCount,
    sourceType: manuscriptVersions.sourceType,
    createdAt: manuscriptVersions.createdAt,
  }).from(manuscriptVersions)
    .where(eq(manuscriptVersions.chapterId, chapterId))
    .orderBy(desc(manuscriptVersions.versionNo));
  return NextResponse.json({ versions });
}

export async function POST(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const parsed = restoreSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  const restored = await db.transaction(async (tx) => {
    const [source] = await tx.select().from(manuscriptVersions)
      .where(eq(manuscriptVersions.id, parsed.data.versionId)).limit(1);
    if (!source || source.chapterId !== chapterId) return null;
    const [latest] = await tx.select({ versionNo: manuscriptVersions.versionNo })
      .from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, chapterId))
      .orderBy(desc(manuscriptVersions.versionNo)).limit(1);

    // Restoring creates a new head version; historical snapshots remain immutable.
    const [version] = await tx.insert(manuscriptVersions).values({
      chapterId,
      versionNo: (latest?.versionNo ?? 0) + 1,
      contentJson: source.contentJson,
      contentText: source.contentText,
      wordCount: source.wordCount,
      sourceType: "restore",
    }).returning();
    await tx.update(chapters).set({ currentWords: source.wordCount, updatedAt: new Date() })
      .where(eq(chapters.id, chapterId));
    return version;
  });
  if (!restored) return NextResponse.json({ error: "VERSION_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(restored);
}
