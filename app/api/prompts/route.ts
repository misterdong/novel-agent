import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { projects, promptTemplates } from "@/db/schema";
import { promptCatalog } from "@/lib/ai/prompt-catalog";

const saveSchema = z.object({ projectId: z.string().uuid(), taskType: z.string().min(1).max(80), customPrompt: z.string().max(12000), enabled: z.boolean().default(true) });

export async function GET(request: Request) {
  const requestedId = new URL(request.url).searchParams.get("projectId");
  const [project] = requestedId
    ? await db.select().from(projects).where(eq(projects.id, requestedId)).limit(1)
    : await db.select().from(projects).where(eq(projects.status, "active")).limit(1);
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  const overrides = await db.select().from(promptTemplates).where(eq(promptTemplates.projectId, project.id));
  return NextResponse.json({
    project: { id: project.id, title: project.title },
    prompts: promptCatalog.map((item) => ({ ...item, customPrompt: overrides.find((row) => row.taskType === item.taskType)?.customPrompt ?? "", enabled: overrides.find((row) => row.taskType === item.taskType)?.enabled ?? true })),
  });
}

export async function PUT(request: Request) {
  const parsed = saveSchema.safeParse(await request.json());
  if (!parsed.success || !promptCatalog.some((item) => item.taskType === parsed.data?.taskType)) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const data = parsed.data;
  const [saved] = await db.insert(promptTemplates).values(data).onConflictDoUpdate({
    target: [promptTemplates.projectId, promptTemplates.taskType],
    set: { customPrompt: data.customPrompt, enabled: data.enabled, updatedAt: new Date() },
  }).returning();
  return NextResponse.json(saved);
}
