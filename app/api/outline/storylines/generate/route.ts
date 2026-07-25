import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { projects, promptTemplates, storylineNodes, storylines } from "@/db/schema";
import { getDefaultPrompt } from "@/lib/ai/prompt-catalog";
import { getAiProvider } from "@/lib/ai/provider-factory";

const requestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generate"), projectId: z.string().uuid() }),
  z.object({ mode: z.literal("refine"), projectId: z.string().uuid(), storylineId: z.string().uuid() }),
]);

const priorities = new Set(["core", "important", "supporting"]);
const storylineTypes = new Set(["main", "character", "relationship", "mystery", "world", "subplot"]);

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const data = parsed.data;
  const [project] = await db.select().from(projects).where(eq(projects.id, data.projectId)).limit(1);
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  const storyPlan = ((project.settings as Record<string, unknown>).storyPlan as Record<string, unknown> | undefined) ?? {};
  if (!Object.keys(storyPlan).length) return NextResponse.json({ error: "STORY_PLAN_REQUIRED", message: "请先保存故事总纲。" }, { status: 409 });

  const [existingLines, promptRows] = await Promise.all([
    db.select().from(storylines).where(eq(storylines.projectId, project.id)).orderBy(asc(storylines.position)),
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, project.id)),
  ]);
  if (data.mode === "generate") {
    let output: Record<string, unknown>;
    try {
      output = await getAiProvider().generateStorylines({
        storyPlan,
        existingNames: existingLines.map((line) => line.name),
        defaultPrompt: getDefaultPrompt("story.storylines.generate"),
        customPrompt: promptRows.find((item) => item.taskType === "story.storylines.generate" && item.enabled)?.customPrompt ?? "",
      });
    } catch (error) {
      console.error("AI 生成故事线失败", error);
      return NextResponse.json({ error: "AI_OUTPUT_INVALID", message: "模型连续两次返回了不完整的故事线数据，请稍后重试或减少总纲长度。" }, { status: 502 });
    }
    const candidates = Array.isArray(output.storylines) ? output.storylines as Array<Record<string, unknown>> : [];
    const accepted = candidates.filter((line) => String(line.name ?? "").trim() && !existingLines.some((existing) => existing.name === String(line.name))).slice(0, 8);
    await db.transaction(async (tx) => {
      for (let index = 0; index < accepted.length; index += 1) {
        const line = accepted[index];
        const [created] = await tx.insert(storylines).values({ projectId: project.id, position: existingLines.length + index + 1, name: String(line.name), storylineType: storylineTypes.has(String(line.storylineType)) ? String(line.storylineType) : "subplot", summary: String(line.summary ?? ""), coreQuestion: String(line.coreQuestion ?? ""), initialState: String(line.initialState ?? ""), targetOutcome: String(line.targetOutcome ?? ""), coreConflict: String(line.coreConflict ?? ""), currentProgress: String(line.currentProgress ?? ""), nextPlan: String(line.nextPlan ?? ""), completionCriteria: String(line.completionCriteria ?? ""), priority: priorities.has(String(line.priority)) ? String(line.priority) : "important" }).returning();
        const nodes = Array.isArray(line.nodes) ? line.nodes as Array<Record<string, unknown>> : [];
        if (nodes.length) await tx.insert(storylineNodes).values(nodes.filter((node) => String(node.title ?? "").trim()).slice(0, 12).map((node, nodeIndex) => ({ projectId: project.id, storylineId: created.id, position: nodeIndex + 1, title: String(node.title), objective: String(node.objective ?? ""), entryCondition: String(node.entryCondition ?? "") })));
      }
    });
    return NextResponse.json({ created: accepted.length });
  }

  const line = existingLines.find((item) => item.id === data.storylineId);
  if (!line) return NextResponse.json({ error: "STORYLINE_NOT_FOUND" }, { status: 404 });
  const existingNodes = await db.select().from(storylineNodes).where(eq(storylineNodes.storylineId, line.id)).orderBy(asc(storylineNodes.position));
  let output: Record<string, unknown>;
  try {
    output = await getAiProvider().refineStoryline({ storyPlan, storyline: line, existingNodes });
  } catch (error) {
    console.error("AI 细化故事线失败", error);
    return NextResponse.json({ error: "AI_OUTPUT_INVALID", message: "模型连续两次返回了不完整的节点数据，请稍后重试。" }, { status: 502 });
  }
  const candidates = (Array.isArray(output.nodes) ? output.nodes as Array<Record<string, unknown>> : []).filter((node) => String(node.title ?? "").trim() && !existingNodes.some((existing) => existing.title === String(node.title))).slice(0, 12);
  const [last] = await db.select({ position: storylineNodes.position }).from(storylineNodes).where(eq(storylineNodes.storylineId, line.id)).orderBy(desc(storylineNodes.position)).limit(1);
  if (candidates.length) await db.insert(storylineNodes).values(candidates.map((node, index) => ({ projectId: project.id, storylineId: line.id, position: (last?.position ?? 0) + index + 1, title: String(node.title), objective: String(node.objective ?? ""), entryCondition: String(node.entryCondition ?? ""), result: String(node.result ?? "") })));
  return NextResponse.json({ created: candidates.length });
}
