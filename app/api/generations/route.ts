import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { chapters, generationRuns } from "@/db/schema";

const createSchema = z.object({ chapterId: z.string().uuid(), sceneId: z.string().uuid().optional(), instruction: z.string().max(3000).default("") });
const actionSchema = z.object({ id: z.string().uuid(), action: z.enum(["cancel", "retry"]) });

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });
  const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, id)).limit(1);
  return run ? NextResponse.json(run) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, parsed.data.chapterId)).limit(1);
  if (!chapter) return NextResponse.json({ error: "CHAPTER_NOT_FOUND" }, { status: 404 });
  const [run] = await db.insert(generationRuns).values({
    projectId: chapter.projectId, chapterId: chapter.id, taskType: "chapter.continue", status: "queued",
    userInstruction: parsed.data.instruction,
    // The worker resolves these stable IDs into current source records when it claims the task.
    inputManifest: { chapterId: chapter.id, sceneId: parsed.data.sceneId },
  }).returning();
  return NextResponse.json(run, { status: 202 });
}

export async function PATCH(request: Request) {
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, parsed.data.id)).limit(1);
  if (!run) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (parsed.data.action === "cancel" && !["queued", "running"].includes(run.status)) return NextResponse.json({ error: "NOT_CANCELLABLE" }, { status: 409 });
  if (parsed.data.action === "retry" && !["failed", "cancelled"].includes(run.status)) return NextResponse.json({ error: "NOT_RETRYABLE" }, { status: 409 });
  const [updated] = await db.update(generationRuns).set({ status: parsed.data.action === "cancel" ? "cancelled" : "queued", parsedOutput: null, updatedAt: new Date() }).where(eq(generationRuns.id, run.id)).returning();
  return NextResponse.json(updated);
}
