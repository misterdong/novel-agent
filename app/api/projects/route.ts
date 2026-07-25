import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { chapters, manuscriptVersions, projects, volumes } from "@/db/schema";

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  genre: z.string().trim().min(1).max(100),
});

export async function GET() {
  const rows = await db.select({ id: projects.id, title: projects.title, genre: projects.genre })
    .from(projects).where(eq(projects.status, "active")).orderBy(desc(projects.updatedAt));
  return NextResponse.json({ projects: rows });
}

export async function POST(request: Request) {
  const parsed = createProjectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }
  // A project is only usable when its initial volume, chapter, and manuscript exist,
  // so the four records are created atomically.
  const result = await db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values(parsed.data).returning();
    const [volume] = await tx.insert(volumes).values({ projectId: project.id, title: "第一卷", position: 1, objective: "" }).returning();
    const [chapter] = await tx.insert(chapters).values({
      projectId: project.id,
      volumeId: volume.id,
      position: 1,
      title: "新的开始",
      status: "writing",
      outline: {},
    }).returning();
    await tx.insert(manuscriptVersions).values({
      chapterId: chapter.id,
      versionNo: 1,
      contentJson: { type: "doc", text: "" },
      contentText: "",
      sourceType: "user",
    });
    return { project, volume, chapter };
  });
  return NextResponse.json(result, { status: 201 });
}
