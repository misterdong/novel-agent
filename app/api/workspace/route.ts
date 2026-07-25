import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { characters, chapters, manuscriptVersions, projects, scenes, storyBibleEntries, volumes } from "@/db/schema";

const saveSchema = z.object({
  chapterId: z.string().uuid(),
  content: z.string().max(200_000),
  sourceType: z.enum(["user", "ai", "rewrite", "restore", "autosave"]).default("autosave"),
});

const createWorkspaceSchema = z.union([
  z.object({ kind: z.literal("volume"), projectId: z.string().uuid(), title: z.string().trim().min(1).max(200) }),
  z.object({ kind: z.literal("chapter").optional(), volumeId: z.string().uuid(), title: z.string().trim().min(1).max(200) }),
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedProjectId = url.searchParams.get("projectId");
  const requestedChapterId = url.searchParams.get("chapterId");
  const [project] = await db.select().from(projects)
    .where(requestedProjectId
      ? and(eq(projects.id, requestedProjectId), eq(projects.status, "active"))
      : eq(projects.status, "active"))
    .orderBy(desc(projects.updatedAt))
    .limit(1);

  if (!project) {
    return NextResponse.json({ error: "NO_PROJECT" }, { status: 404 });
  }

  const volumeRows = await db.select().from(volumes)
    .where(eq(volumes.projectId, project.id))
    .orderBy(asc(volumes.position));

  if (!volumeRows.length) {
    // 项目与分卷是不同层级：删除全部分卷后项目仍然有效，应返回可恢复的空状态。
    const [people, hardRules] = await Promise.all([
      db.select().from(characters).where(eq(characters.projectId, project.id)).orderBy(asc(characters.name)),
      db.select().from(storyBibleEntries).where(and(eq(storyBibleEntries.projectId, project.id), eq(storyBibleEntries.strength, "hard"))).orderBy(asc(storyBibleEntries.name)),
    ]);
    return NextResponse.json({
      project: { id: project.id, title: project.title, genre: project.genre, narrativePov: project.narrativePov },
      volume: null, chapters: [], activeChapter: null, scenes: [],
      characters: people.map((person) => ({ id: person.id, name: person.name, coreDesire: person.coreDesire, externalGoal: person.externalGoal })),
      hardRules: hardRules.map((rule) => ({ id: rule.id, name: rule.name, summary: rule.summary })),
    });
  }

  const projectChapters = await db.select().from(chapters)
    .where(eq(chapters.projectId, project.id))
    .orderBy(asc(chapters.position));
  const activeChapter = projectChapters.find((chapter) => chapter.id === requestedChapterId)
    ?? projectChapters.find((chapter) => chapter.status === "writing")
    ?? projectChapters[0];
  // 优先选择活动章节所属分卷；如果项目尚无章节，则仍返回第一个分卷，
  // 让页面能够正常展示空状态并允许用户创建第一章。
  const volume = volumeRows.find((item) => item.id === activeChapter?.volumeId) ?? volumeRows[0];
  const chapterRows = projectChapters.filter((chapter) => chapter.volumeId === volume.id);

  if (!activeChapter) {
    const [people, hardRules] = await Promise.all([
      db.select().from(characters).where(eq(characters.projectId, project.id)).orderBy(asc(characters.name)),
      db.select().from(storyBibleEntries).where(and(eq(storyBibleEntries.projectId, project.id), eq(storyBibleEntries.strength, "hard"))).orderBy(asc(storyBibleEntries.name)),
    ]);
    return NextResponse.json({
      project: { id: project.id, title: project.title, genre: project.genre, narrativePov: project.narrativePov },
      volume: { id: volume.id, title: volume.title },
      chapters: [], activeChapter: null, scenes: [],
      characters: people.map((person) => ({ id: person.id, name: person.name, coreDesire: person.coreDesire, externalGoal: person.externalGoal })),
      hardRules: hardRules.map((rule) => ({ id: rule.id, name: rule.name, summary: rule.summary })),
    });
  }

  // 创作页通过一次请求获取完整上下文，避免切换项目或章节后右侧助手仍显示旧数据。
  const [manuscripts, sceneRows, people, hardRules] = await Promise.all([
    db.select().from(manuscriptVersions)
      .where(eq(manuscriptVersions.chapterId, activeChapter.id))
      .orderBy(desc(manuscriptVersions.versionNo))
      .limit(1),
    db.select().from(scenes)
      .where(eq(scenes.chapterId, activeChapter.id)).orderBy(asc(scenes.position)),
    db.select().from(characters)
      .where(eq(characters.projectId, project.id)).orderBy(asc(characters.name)),
    db.select().from(storyBibleEntries)
      .where(and(eq(storyBibleEntries.projectId, project.id), eq(storyBibleEntries.strength, "hard")))
      .orderBy(asc(storyBibleEntries.name)),
  ]);
  const manuscript = manuscripts[0];

  return NextResponse.json({
    project: { id: project.id, title: project.title, genre: project.genre, narrativePov: project.narrativePov },
    volume: { id: volume.id, title: volume.title },
    chapters: chapterRows.map((chapter) => ({
      id: chapter.id,
      number: chapter.position,
      title: chapter.title,
      words: chapter.currentWords,
      status: chapter.status,
    })),
    activeChapter: {
      id: activeChapter.id,
      number: activeChapter.position,
      title: activeChapter.title,
      status: activeChapter.status,
      outline: activeChapter.outline,
      content: manuscript?.contentText ?? "",
      version: manuscript?.versionNo ?? 0,
    },
    scenes: sceneRows,
    characters: people.map((person) => ({
      id: person.id,
      name: person.name,
      coreDesire: person.coreDesire,
      externalGoal: person.externalGoal,
    })),
    hardRules: hardRules.map((rule) => ({ id: rule.id, name: rule.name, summary: rule.summary })),
  });
}

export async function POST(request: Request) {
  const parsed = createWorkspaceSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.kind === "volume") {
    const [project] = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId)).limit(1);
    if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
    const [last] = await db.select({ position: volumes.position }).from(volumes).where(eq(volumes.projectId, project.id)).orderBy(desc(volumes.position)).limit(1);
    const [created] = await db.insert(volumes).values({ projectId: project.id, position: (last?.position ?? 0) + 1, title: parsed.data.title, objective: "" }).returning();
    return NextResponse.json(created, { status: 201 });
  }
  const [volume] = await db.select().from(volumes).where(eq(volumes.id, parsed.data.volumeId)).limit(1);
  if (!volume) return NextResponse.json({ error: "VOLUME_NOT_FOUND" }, { status: 404 });
  const existing = await db.select({ position: chapters.position }).from(chapters)
    .where(eq(chapters.volumeId, volume.id)).orderBy(desc(chapters.position)).limit(1);
  const [chapter] = await db.insert(chapters).values({
    projectId: volume.projectId,
    volumeId: volume.id,
    position: (existing[0]?.position ?? 0) + 1,
    title: parsed.data.title,
    status: "writing",
    outline: {},
  }).returning();
  await db.insert(manuscriptVersions).values({
    chapterId: chapter.id,
    versionNo: 1,
    contentJson: { type: "doc", text: "" },
    contentText: "",
    sourceType: "user",
  });
  return NextResponse.json({ id: chapter.id, number: chapter.position, title: chapter.title }, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = saveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const { chapterId, content, sourceType } = parsed.data;
  const result = await db.transaction(async (tx) => {
    const [chapter] = await tx.select().from(chapters)
      .where(and(eq(chapters.id, chapterId), eq(chapters.status, "writing")))
      .limit(1);
    if (!chapter) return null;

    // Version numbers are allocated and inserted in one transaction so concurrent saves
    // cannot silently overwrite the previous manuscript snapshot.
    const [latest] = await tx.select({ versionNo: manuscriptVersions.versionNo })
      .from(manuscriptVersions)
      .where(eq(manuscriptVersions.chapterId, chapterId))
      .orderBy(desc(manuscriptVersions.versionNo))
      .limit(1);
    const wordCount = content.replace(/\s/g, "").length;
    const [version] = await tx.insert(manuscriptVersions).values({
      chapterId,
      versionNo: (latest?.versionNo ?? 0) + 1,
      contentJson: { type: "doc", text: content },
      contentText: content,
      wordCount,
      sourceType,
    }).returning({ id: manuscriptVersions.id, versionNo: manuscriptVersions.versionNo });
    await tx.update(chapters).set({ currentWords: wordCount, updatedAt: new Date() })
      .where(eq(chapters.id, chapterId));
    return { ...version, wordCount };
  });

  if (!result) {
    return NextResponse.json({ error: "CHAPTER_NOT_WRITABLE" }, { status: 409 });
  }
  return NextResponse.json(result);
}
