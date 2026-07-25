import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { characters, projects, promptTemplates } from "@/db/schema";
import { getDefaultPrompt } from "@/lib/ai/prompt-catalog";
import { getAiProvider } from "@/lib/ai/provider-factory";

const schema = z.object({ projectId: z.string().uuid(), characterId: z.string().uuid(), instruction: z.string().max(3000).default("") });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [project, person, allPeople, prompts] = await Promise.all([
    db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1),
    db.select().from(characters).where(eq(characters.id, parsed.data.characterId)).limit(1),
    db.select().from(characters).where(eq(characters.projectId, parsed.data.projectId)),
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, parsed.data.projectId)),
  ]);
  if (!project[0] || !person[0] || person[0].projectId !== project[0].id) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  try {
    const output = await getAiProvider().generateStoryBible({
      brief: `正式总纲：${JSON.stringify((project[0].settings as Record<string, unknown>).storyPlan ?? {})}\n待完善人物：${JSON.stringify(person[0])}\n其他人物：${JSON.stringify(allPeople.filter((item) => item.id !== person[0].id).map((item) => ({ name: item.name, role: item.profile.role })))}\n用户要求：${parsed.data.instruction || "保持已有事实，补齐人物深度"}\n只返回一个同名人物。不得更改姓名和已有明确事实。补齐 occupation、faction、archetype、flaw、fear、secret、arcStart、arcTarget、speechStyle。`,
      genre: project[0].genre,
      existingNames: allPeople.filter((item) => item.id !== person[0].id).map((item) => item.name),
      defaultPrompt: getDefaultPrompt("character.generate"),
      customPrompt: prompts.find((item) => item.taskType === "character.generate" && item.enabled)?.customPrompt ?? "",
    });
    const candidate = Array.isArray(output.characters) ? output.characters[0] : null;
    return candidate ? NextResponse.json({ character: candidate }) : NextResponse.json({ error: "EMPTY_RESULT", message: "模型没有返回人物档案。" }, { status: 502 });
  } catch (error) {
    return NextResponse.json({ error: "AI_REFINE_FAILED", message: error instanceof Error ? error.message : "AI 完善人物失败" }, { status: 502 });
  }
}
