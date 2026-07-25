import { and, desc, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { characterKnowledge, characterRelationshipChanges, characterRelationships, characters, chapterSummaries, chapters, foreshadowingOccurrences, foreshadowings, manuscriptVersions, promptTemplates, stateChangeProposals, storyFacts, storyItemChanges, storyItems, timelineEvents } from "@/db/schema";
import { getDefaultPrompt } from "@/lib/ai/prompt-catalog";
import { getAiProvider } from "@/lib/ai/provider-factory";

const reviewSchema = z.object({ proposalId: z.string().uuid(), decision: z.enum(["accepted", "rejected"]) });
const uuidSchema = z.string().uuid();

function optionalUuid(value: unknown) {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function GET(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const [summaries, proposals] = await Promise.all([
    db.select().from(chapterSummaries).where(eq(chapterSummaries.chapterId, chapterId)).orderBy(desc(chapterSummaries.createdAt)).limit(1),
    db.select().from(stateChangeProposals).where(eq(stateChangeProposals.chapterId, chapterId)).orderBy(desc(stateChangeProposals.createdAt)),
  ]);
  return NextResponse.json({ summary: summaries[0] ?? null, proposals });
}

export async function POST(_request: Request, context: { params: Promise<{ chapterId: string }> }) {
  // 每次提取都绑定到最新的不可变正文版本。
  // 正文发生变化后再次提取，会生成独立的记忆快照。
  const { chapterId } = await context.params;
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  const [version] = await db.select().from(manuscriptVersions).where(eq(manuscriptVersions.chapterId, chapterId)).orderBy(desc(manuscriptVersions.versionNo)).limit(1);
  if (!chapter || !version) return NextResponse.json({ error: "CHAPTER_NOT_FOUND" }, { status: 404 });
  if (!version.contentText.trim()) return NextResponse.json({ error: "EMPTY_MANUSCRIPT", message: "当前章节没有可提取的正文。" }, { status: 400 });
  const [prompts, people, threads, timeline, knowledge, items, relationships] = await Promise.all([
    db.select().from(promptTemplates).where(eq(promptTemplates.projectId, chapter.projectId)),
    db.select().from(characters).where(eq(characters.projectId, chapter.projectId)),
    db.select().from(foreshadowings).where(eq(foreshadowings.projectId, chapter.projectId)),
    db.select().from(timelineEvents).where(eq(timelineEvents.projectId, chapter.projectId)).orderBy(desc(timelineEvents.createdAt)).limit(30),
    db.select().from(characterKnowledge).where(and(eq(characterKnowledge.projectId, chapter.projectId), eq(characterKnowledge.active, true))),
    db.select().from(storyItems).where(and(eq(storyItems.projectId, chapter.projectId), eq(storyItems.active, true))),
    db.select().from(characterRelationships).where(and(eq(characterRelationships.projectId, chapter.projectId), eq(characterRelationships.active, true))),
  ]);
  let resultFromAi;
  try {
    resultFromAi = await getAiProvider().extractChapterMemory({
      chapterTitle: chapter.title,
      chapterOutline: chapter.outline,
      manuscript: version.contentText,
      defaultSummaryPrompt: getDefaultPrompt("chapter.summary"),
      customSummaryPrompt: prompts.find((item) => item.taskType === "chapter.summary" && item.enabled)?.customPrompt ?? "",
      defaultStatePrompt: getDefaultPrompt("state.extract"),
      customStatePrompt: prompts.find((item) => item.taskType === "state.extract" && item.enabled)?.customPrompt ?? "",
      characters: people.map((item) => ({ id: item.id, name: item.name })),
      existingForeshadowings: threads.map((item) => ({ id: item.id, title: item.title, purpose: item.purpose, status: item.status, importance: item.importance, hiddenInformation: item.hiddenInformation })),
      recentTimeline: timeline.map((item) => ({ title: item.title, description: item.description, relativeDay: item.relativeDay, locationName: item.locationName })),
      existingKnowledge: knowledge.map((item) => ({ characterName: people.find((person) => person.id === item.characterId)?.name ?? "未知人物", proposition: item.proposition, state: item.state })),
      existingItems: items.map((item) => ({ id: item.id, name: item.name, itemType: item.itemType, holderName: people.find((person) => person.id === item.holderCharacterId)?.name ?? "", currentLocation: item.currentLocation, status: item.status, storyFunction: item.storyFunction, nextPlan: item.nextPlan })),
      existingRelationships: relationships.map((item) => ({ id: item.id, characterAName: people.find((person) => person.id === item.characterAId)?.name ?? "", characterBName: people.find((person) => person.id === item.characterBId)?.name ?? "", relationType: item.relationType, status: item.status, aToBAttitude: item.aToBAttitude, bToAAttitude: item.bToAAttitude, nextDirection: item.nextDirection })),
    });
  } catch (error) {
    return NextResponse.json({ error: "AI_MEMORY_EXTRACTION_FAILED", message: error instanceof Error ? `AI 记忆提取失败：${error.message}` : "AI 记忆提取失败，请重试。" }, { status: 502 });
  }
  const result = await db.transaction(async (tx) => {
    // 重新提取只替换当前版本中尚未审批的候选，
    // 用户已经作出的决定继续作为审计历史保留。
    const [summary] = await tx.insert(chapterSummaries).values({ projectId: chapter.projectId, chapterId, manuscriptVersionId: version.id, shortSummary: resultFromAi.shortSummary, detailedSummary: resultFromAi.detailedSummary, openQuestions: resultFromAi.openQuestions }).onConflictDoUpdate({ target: chapterSummaries.manuscriptVersionId, set: { shortSummary: resultFromAi.shortSummary, detailedSummary: resultFromAi.detailedSummary, openQuestions: resultFromAi.openQuestions } }).returning();
    // 这里只删除尚未审批的候选；已接受和已拒绝的记录都不会被覆盖。
    await tx.delete(stateChangeProposals).where(and(eq(stateChangeProposals.manuscriptVersionId, version.id), eq(stateChangeProposals.status, "pending")));
    const proposals = resultFromAi.proposals.length ? await tx.insert(stateChangeProposals).values(resultFromAi.proposals.map((proposal) => ({ projectId: chapter.projectId, chapterId, manuscriptVersionId: version.id, ...proposal }))).returning() : [];
    return { summary, proposals };
  });
  return NextResponse.json(result, { status: 201 });
}

export async function PATCH(request: Request, context: { params: Promise<{ chapterId: string }> }) {
  const { chapterId } = await context.params;
  const parsed = reviewSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  const result = await db.transaction(async (tx) => {
    const [proposal] = await tx.select().from(stateChangeProposals).where(eq(stateChangeProposals.id, parsed.data.proposalId)).limit(1);
    if (!proposal || proposal.chapterId !== chapterId || proposal.status !== "pending") return null;
    // 候选审批和正式状态写入必须保持原子性。
    // 只有目标记录成功创建或更新后，候选才能显示为已接受。
    if (parsed.data.decision === "accepted") {
      const value = proposal.newValue;
      if (proposal.proposalType === "foreshadowing") {
        // 更新伏笔时既修改当前生命周期状态，也追加一次出现记录，
        // 方便作者回溯伏笔的埋设、强化与回收过程。
        const occurrenceActions = ["planned", "planted", "reinforced", "misdirected", "resolved", "abandoned"] as const;
        const occurrenceAction = occurrenceActions.find((state) => state === value.action) ?? "planted";
        const requestedStatus = occurrenceAction === "resolved" ? "paid_off" : occurrenceAction === "abandoned" ? "abandoned" : occurrenceAction === "planned" ? "planned" : "active";
        const existingId = optionalUuid(value.existingId);
        const [existing] = existingId ? await tx.select().from(foreshadowings).where(and(eq(foreshadowings.id, existingId), eq(foreshadowings.projectId, proposal.projectId))).limit(1) : [];
        const [thread] = existing
          ? await tx.update(foreshadowings).set({ status: requestedStatus, purpose: String(value.description ?? existing.purpose), updatedAt: new Date() }).where(eq(foreshadowings.id, existing.id)).returning()
          : await tx.insert(foreshadowings).values({ projectId: proposal.projectId, title: String(value.title ?? proposal.predicate).slice(0, 200), truth: "待规划", purpose: String(value.description ?? ""), status: requestedStatus, importance: Number(value.importance) >= 4 ? "core" : "supporting" }).returning();
        await tx.insert(foreshadowingOccurrences).values({ foreshadowingId: thread.id, chapterId, action: occurrenceAction, description: String(value.description ?? proposal.predicate), evidence: proposal.evidence });
      } else if (proposal.proposalType === "timeline") {
        await tx.insert(timelineEvents).values({ projectId: proposal.projectId, chapterId, title: String(value.title ?? proposal.predicate).slice(0, 200), description: String(value.description ?? ""), timeKind: value.relativeDay == null ? "unknown" : "relative", relativeDay: typeof value.relativeDay === "number" ? Math.trunc(value.relativeDay) : null, locationName: String(value.locationName ?? "").slice(0, 200) });
      } else if (proposal.proposalType === "knowledge") {
        // 人物认知具有方向性和主观性。同一人物对同一命题产生新认知时，
        // 应让旧认知失效，而不是把它当成新的客观事实。
        const person = await tx.select().from(characters).where(and(eq(characters.projectId, proposal.projectId), eq(characters.name, String(value.characterName ?? "")))).limit(1);
        if (!person[0]) throw new Error(`人物不存在：${String(value.characterName ?? "未指定")}`);
        const knowledgeStates = ["knows", "believes", "suspects", "does_not_know"] as const;
        const state = knowledgeStates.find((item) => item === value.state) ?? "suspects";
        const proposition = String(value.proposition ?? proposal.predicate);
        await tx.update(characterKnowledge).set({ active: false, updatedAt: new Date() }).where(and(eq(characterKnowledge.projectId, proposal.projectId), eq(characterKnowledge.characterId, person[0].id), eq(characterKnowledge.proposition, proposition), eq(characterKnowledge.active, true)));
        await tx.insert(characterKnowledge).values({ projectId: proposal.projectId, characterId: person[0].id, proposition, state, sourceChapterId: chapterId, active: true });
      } else if (proposal.proposalType === "relationship") {
        // 同一对人物只保存一条正式关系，但保留两个方向不同的态度。
        // 模型可能以任意顺序提到双方，因此在这里统一映射方向。
        const sourceName = String(value.sourceName ?? "");
        const targetName = String(value.targetName ?? "");
        const [sourceRows, targetRows] = await Promise.all([
          tx.select().from(characters).where(and(eq(characters.projectId, proposal.projectId), eq(characters.name, sourceName))).limit(1),
          tx.select().from(characters).where(and(eq(characters.projectId, proposal.projectId), eq(characters.name, targetName))).limit(1),
        ]);
        const source = sourceRows[0];
        const target = targetRows[0];
        if (!source || !target || source.id === target.id) throw new Error("关系候选中的人物不存在或相同");
        const existingId = optionalUuid(value.existingId);
        const [existing] = existingId
          ? await tx.select().from(characterRelationships).where(and(eq(characterRelationships.id, existingId), eq(characterRelationships.projectId, proposal.projectId))).limit(1)
          : await tx.select().from(characterRelationships).where(and(eq(characterRelationships.projectId, proposal.projectId), or(and(eq(characterRelationships.characterAId, source.id), eq(characterRelationships.characterBId, target.id)), and(eq(characterRelationships.characterAId, target.id), eq(characterRelationships.characterBId, source.id))))).limit(1);
        const sourceIsA = !existing || existing.characterAId === source.id;
        const relationValues = { relationType: String(value.relationType ?? "acquaintance").slice(0, 60), status: String(value.relationshipStatus ?? "neutral").slice(0, 60), aToBAttitude: String(sourceIsA ? value.sourceAttitude ?? "" : value.targetAttitude ?? ""), bToAAttitude: String(sourceIsA ? value.targetAttitude ?? "" : value.sourceAttitude ?? ""), description: String(value.description ?? proposal.predicate), nextDirection: String(value.nextDirection ?? ""), lastChangedChapterId: chapterId };
        const [relationship] = existing
          ? await tx.update(characterRelationships).set({ ...relationValues, updatedAt: new Date() }).where(eq(characterRelationships.id, existing.id)).returning()
          : await tx.insert(characterRelationships).values({ projectId: proposal.projectId, characterAId: source.id, characterBId: target.id, ...relationValues, firstChapterId: chapterId }).returning();
        await tx.insert(characterRelationshipChanges).values({ relationshipId: relationship.id, chapterId, previousStatus: existing?.status ?? "", newStatus: relationValues.status, description: relationValues.description, evidence: proposal.evidence });
      } else if (proposal.proposalType === "story_item") {
        // 只有审批通过的剧情重要物品才进入正式道具表。
        // 每次接受变化时，同时更新当前快照并追加带证据的历史记录。
        const holder = value.holderName ? await tx.select().from(characters).where(and(eq(characters.projectId, proposal.projectId), eq(characters.name, String(value.holderName)))).limit(1) : [];
        const relatedNames = Array.isArray(value.relatedCharacters) ? value.relatedCharacters.map(String) : [];
        const relatedPeople = relatedNames.length ? await tx.select().from(characters).where(eq(characters.projectId, proposal.projectId)) : [];
        const existingId = optionalUuid(value.existingId);
        const [existing] = existingId ? await tx.select().from(storyItems).where(and(eq(storyItems.id, existingId), eq(storyItems.projectId, proposal.projectId))).limit(1) : [];
        const values = { name: String(value.title ?? proposal.predicate).slice(0, 200), itemType: String(value.itemType ?? "plot").slice(0, 50), description: String(value.description ?? ""), holderCharacterId: holder[0]?.id ?? null, currentLocation: String(value.locationName ?? "").slice(0, 200), status: String(value.status ?? "intact").slice(0, 40), storyFunction: String(value.storyFunction ?? ""), nextPlan: String(value.nextPlan ?? ""), relatedCharacterIds: relatedPeople.filter((person) => relatedNames.includes(person.name)).map((person) => person.id), relatedForeshadowingIds: Array.isArray(value.relatedForeshadowingIds) ? value.relatedForeshadowingIds.map(String) : [], lastChangedChapterId: chapterId, importance: Math.min(5, Math.max(1, Number(value.importance) || 3)) };
        const [item] = existing
          ? await tx.update(storyItems).set({ ...values, firstChapterId: existing.firstChapterId, updatedAt: new Date() }).where(eq(storyItems.id, existing.id)).returning()
          : await tx.insert(storyItems).values({ projectId: proposal.projectId, ...values, firstChapterId: chapterId }).returning();
        await tx.insert(storyItemChanges).values({ itemId: item.id, chapterId, changeType: String(value.action ?? (existing ? "updated" : "introduced")).slice(0, 40), description: String(value.description ?? proposal.predicate), evidence: proposal.evidence });
      } else {
        await tx.insert(storyFacts).values({ projectId: proposal.projectId, sourceChapterId: chapterId, predicate: proposal.predicate, value: proposal.newValue, sourceProposalId: proposal.id });
      }
    }
    const [updated] = await tx.update(stateChangeProposals).set({ status: parsed.data.decision, updatedAt: new Date() }).where(eq(stateChangeProposals.id, proposal.id)).returning();
    return updated;
  });
  return result ? NextResponse.json(result) : NextResponse.json({ error: "PROPOSAL_NOT_REVIEWABLE" }, { status: 409 });
}
