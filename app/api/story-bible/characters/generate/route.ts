import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { characters, projects, promptTemplates } from "@/db/schema";
import { getDefaultPrompt } from "@/lib/ai/prompt-catalog";
import { getAiProvider } from "@/lib/ai/provider-factory";

const schema = z.object({ projectId: z.string().uuid(), mode: z.enum(["specified", "candidates"]).default("specified"), instruction: z.string().trim().max(12000).default("") }).superRefine((value, context) => {
  if (value.mode === "specified" && value.instruction.length < 10) context.addIssue({ code: "custom", path: ["instruction"], message: "指定人物模式需要填写人物描写" });
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [project] = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
  const [people, prompts] = await Promise.all([
    db.select().from(characters).where(eq(characters.projectId, project.id)),
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, project.id)),
  ]);
  try {
    const customPrompt = prompts.find((item) => item.taskType === "character.generate" && item.enabled)?.customPrompt ?? "";
    const specified = parsed.data.mode === "specified";
    const output = await getAiProvider().generateStoryBible({
      brief: specified
        ? `已有正式总纲：${JSON.stringify((project.settings as Record<string, unknown>).storyPlan ?? {})}\n用户提供的人物描写：${parsed.data.instruction}\n任务：从上述描写中识别并生成且仅生成这一个指定人物的人物卡。姓名、年龄、身份、经历、能力、性格、信念、行为方式与人物弧必须忠于原文；不得另造人物，不得把示例中的亲属或敌人拆成候选人物。可以将原文隐含信息归纳到档案字段，但不能改变既定事实。只返回 characters 数组中的一个人物，其他资产数组返回空数组。`
        : `已有正式总纲：${JSON.stringify((project.settings as Record<string, unknown>).storyPlan ?? {})}\n人物生成要求：${parsed.data.instruction || "未补充特殊要求，请依据总纲生成三个功能互补的人物"}\n必须生成 3 个人物候选，只返回 characters，其他资产数组返回空数组。`,
      genre: project.genre,
      existingNames: people.map((item) => item.name),
      defaultPrompt: getDefaultPrompt("character.generate"),
      customPrompt,
    });
    const generated = Array.isArray(output.characters) ? output.characters : [];
    return NextResponse.json({ characters: specified ? generated.slice(0, 1) : generated.slice(0, 3), mode: parsed.data.mode });
  } catch (error) {
    return NextResponse.json({ error: "AI_GENERATION_FAILED", message: error instanceof Error ? error.message : "人物生成失败" }, { status: 502 });
  }
}
