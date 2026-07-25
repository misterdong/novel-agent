import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { autopilotEvents, autopilotRuns, projects } from "@/db/schema";

const createSchema = z.object({ projectId: z.string().uuid(), instruction: z.string().max(5000).default(""), targetWords: z.number().int().min(1000).max(20000).default(3000), maxRepairs: z.number().int().min(0).max(5).default(2) });
const actionSchema = z.object({ id: z.string().uuid(), action: z.enum(["pause", "resume", "cancel", "retry"]) });

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "PROJECT_ID_REQUIRED" }, { status: 400 });
  const runs = await db.select().from(autopilotRuns).where(eq(autopilotRuns.projectId, projectId)).orderBy(desc(autopilotRuns.createdAt)).limit(20);
  const events = await db.select().from(autopilotEvents).where(eq(autopilotEvents.projectId, projectId)).orderBy(desc(autopilotEvents.createdAt)).limit(400);
  return NextResponse.json({ runs, events });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  const [project] = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  const [run] = await db.insert(autopilotRuns).values({ ...parsed.data, scope: "chapter", status: "queued", currentStage: "queued", lastMessage: "任务已进入自动创作队列" }).returning();
  await db.insert(autopilotEvents).values({ runId: run.id, projectId: run.projectId, stage: "queued", eventType: "run_created", message: "自动创作任务已创建", details: { targetWords: run.targetWords, maxRepairs: run.maxRepairs, instruction: run.instruction } });
  return NextResponse.json(run, { status: 202 });
}

export async function PATCH(request: Request) {
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [run] = await db.select().from(autopilotRuns).where(eq(autopilotRuns.id, parsed.data.id)).limit(1);
  if (!run) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const updates = parsed.data.action === "pause" ? { status: "paused", lastMessage: "任务已暂停" }
    : parsed.data.action === "resume" ? { status: "running", lastMessage: "任务已恢复" }
      : parsed.data.action === "cancel" ? { status: "cancelled", lastMessage: "任务已终止" }
        : { status: "running", errorMessage: "", lastMessage: "正在从失败阶段重试" };
  const [updated] = await db.update(autopilotRuns).set({ ...updates, updatedAt: new Date() }).where(eq(autopilotRuns.id, run.id)).returning();
  await db.insert(autopilotEvents).values({ runId: run.id, projectId: run.projectId, chapterId: run.chapterId, stage: run.currentStage, eventType: `run_${parsed.data.action}`, level: parsed.data.action === "cancel" ? "warning" : "info", message: updates.lastMessage, details: { previousStatus: run.status, nextStatus: updates.status } });
  return NextResponse.json(updated);
}
