import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { characterKnowledge, characterRelationships, characters, chapters, foreshadowings, manuscriptVersions, promptTemplates, reviewIssues, storyBibleEntries, storyItems, timelineEvents } from "@/db/schema";
import { getAiRuntimeConfig } from "@/lib/ai/config";
import { getDefaultPrompt } from "@/lib/ai/prompt-catalog";
import { getAiProvider } from "@/lib/ai/provider-factory";

const actionSchema = z.object({ issueId: z.string().uuid(), action: z.enum(["fixed", "ignored", "false_positive"]) });

export async function GET(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const issues = await db.select().from(reviewIssues).where(eq(reviewIssues.chapterId, chapterId)).orderBy(desc(reviewIssues.createdAt));
  return NextResponse.json({ issues });
}

export async function POST(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  const [version] = await db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, chapterId)).orderBy(desc(manuscriptVersions.versionNo)).limit(1);
  if (!chapter || !version) return NextResponse.json({ error: "CHAPTER_NOT_FOUND" }, { status: 404 });
  const [hardRules, people, timeline, knowledge, prompts, threads, items, relationships] = await Promise.all([
    db.select().from(storyBibleEntries).where(and(eq(storyBibleEntries.projectId, chapter.projectId), eq(storyBibleEntries.strength, "hard"))),
    db.select().from(characters).where(eq(characters.projectId, chapter.projectId)),
    db.select().from(timelineEvents).where(eq(timelineEvents.projectId, chapter.projectId)),
    db.select().from(characterKnowledge).where(and(eq(characterKnowledge.projectId, chapter.projectId), eq(characterKnowledge.active, true))),
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, chapter.projectId)),
    db.select().from(foreshadowings).where(eq(foreshadowings.projectId, chapter.projectId)),
    db.select().from(storyItems).where(and(eq(storyItems.projectId, chapter.projectId), eq(storyItems.active, true))),
    db.select().from(characterRelationships).where(and(eq(characterRelationships.projectId, chapter.projectId), eq(characterRelationships.active, true))),
  ]);
  const issues: typeof reviewIssues.$inferInsert[] = [];
  const endingHook = String((chapter.outline as Record<string, unknown>).endingHook ?? "");
  if (endingHook.includes("照片") && !version.contentText.includes("照片")) issues.push({ projectId: chapter.projectId, chapterId, manuscriptVersionId: version.id, reviewType: "plot", severity: "warning", code: "PLANNED_EVENT_MISSING", title: "结尾钩子尚未落入正文", explanation: "章节卡计划用照片制造结尾钩子，但当前正文尚未出现照片。", evidence: [{ source: "chapter_outline", value: endingHook }], suggestions: [{ action: "append", description: "补入照片钩子", replacement: "老人从风衣内袋取出一张发黄的照片，轻轻推到分诊台上。照片中的手术台旁，站着另一个林默。" }] });
  if (hardRules.length && version.contentText.length < 300) issues.push({ projectId: chapter.projectId, chapterId, manuscriptVersionId: version.id, reviewType: "continuity", severity: "suggestion", code: "HARD_RULE_CONTEXT_THIN", title: "硬性规则上下文较少", explanation: "当前正文较短，硬性规则是否得到足够铺垫仍需人工确认。", evidence: hardRules.map((rule) => ({ sourceId: rule.id, name: rule.name })), suggestions: [{ action: "review", description: "检查是否需要强化规则边界，不自动修改正文" }] });

  const config = getAiRuntimeConfig();
  if (!config) return NextResponse.json({ error: "AI_PROVIDER_NOT_CONFIGURED", message: "一致性检查需要可用的 AI Provider，请检查 .env 配置并重启服务。" }, { status: 503 });
  const customPrompt = prompts.find((item) => item.taskType === "review.continuity" && item.enabled)?.customPrompt ?? "";
  try {
    const aiIssues = await getAiProvider().reviewChapter({
      chapterTitle: chapter.title,
      chapterOutline: chapter.outline,
      manuscript: version.contentText,
      hardRules: hardRules.map((item) => ({ id: item.id, name: item.name, summary: item.summary })),
      characters: people.map((item) => ({ id: item.id, name: item.name, coreDesire: item.coreDesire, externalGoal: item.externalGoal, internalNeed: item.internalNeed, behaviorConstraints: item.behaviorConstraints, profile: item.profile })),
      timeline: timeline.map((item) => ({ title: item.title, description: item.description, relativeDay: item.relativeDay, locationName: item.locationName })),
      characterKnowledge: knowledge.map((item) => ({ characterName: people.find((person) => person.id === item.characterId)?.name ?? "未知人物", proposition: item.proposition, state: item.state })),
      foreshadowings: threads.map((item) => ({ title: item.title, purpose: item.purpose, status: item.status, importance: item.importance, truth: item.truth, hiddenInformation: item.hiddenInformation })),
      storyItems: items.map((item) => ({ name: item.name, holderName: people.find((person) => person.id === item.holderCharacterId)?.name ?? "", currentLocation: item.currentLocation, status: item.status, storyFunction: item.storyFunction })),
      characterRelationships: relationships.map((item) => ({ characterAName: people.find((person) => person.id === item.characterAId)?.name ?? "", characterBName: people.find((person) => person.id === item.characterBId)?.name ?? "", relationType: item.relationType, status: item.status, aToBAttitude: item.aToBAttitude, bToAAttitude: item.bToAAttitude })),
      defaultPrompt: getDefaultPrompt("review.continuity"),
      customPrompt,
    });
    issues.push(...aiIssues.map((item) => ({ ...item, projectId: chapter.projectId, chapterId, manuscriptVersionId: version.id })));
  } catch (error) {
    return NextResponse.json({ error: "AI_REVIEW_FAILED", message: error instanceof Error ? error.message : "AI 一致性检查失败" }, { status: 502 });
  }

  // A rerun replaces only open findings for this manuscript snapshot. Resolved
  // history remains available while duplicate open issues do not accumulate.
  await db.delete(reviewIssues).where(and(eq(reviewIssues.manuscriptVersionId, version.id), eq(reviewIssues.status, "open")));
  const created = issues.length ? await db.insert(reviewIssues).values(issues).returning() : [];
  return NextResponse.json({ issues: created, provider: config.provider, model: config.model }, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const [updated] = await db.update(reviewIssues).set({ status: parsed.data.action, updatedAt: new Date() }).where(eq(reviewIssues.id, parsed.data.issueId)).returning();
  if (!updated || updated.chapterId !== chapterId) return NextResponse.json({ error: "ISSUE_NOT_FOUND" }, { status: 404 });
  return NextResponse.json(updated);
}
