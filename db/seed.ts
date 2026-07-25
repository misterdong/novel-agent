import { eq } from "drizzle-orm";
import { db } from "./index";
import { chapters, manuscriptVersions, projects, volumes } from "./schema";

async function seed() {
const existing = await db.select({ id: projects.id }).from(projects).limit(1);

if (existing.length === 0) {
  const [project] = await db.insert(projects).values({
    title: "寿命盲区",
    genre: "悬疑",
    targetWords: 500_000,
    targetChapters: 200,
    settings: { tone: ["克制", "压迫"], creationMode: "guided" },
  }).returning();

  const [volume] = await db.insert(volumes).values({
    projectId: project.id,
    title: "第一卷 · 无字之人",
    position: 1,
    objective: "林默发现没有寿命数字的人，并被迫追查三年前手术室的真相。",
  }).returning();

  const chapterSeeds = [
    { title: "看不见的数字", currentWords: 3248, status: "completed" as const },
    { title: "零号病房", currentWords: 2916, status: "completed" as const },
    { title: "倒计时之外", currentWords: 0, status: "writing" as const },
    { title: "死者的预约", currentWords: 0, status: "draft" as const },
    { title: "白色谎言", currentWords: 0, status: "draft" as const },
  ];

  const createdChapters = await db.insert(chapters).values(chapterSeeds.map((chapter, index) => ({
    projectId: project.id,
    volumeId: volume.id,
    position: index + 1,
    title: chapter.title,
    status: chapter.status,
    currentWords: chapter.currentWords,
    outline: index === 2 ? {
      objective: "让异常主动找上门",
      scene: "急诊走廊 · 凌晨",
      sceneObjective: "让陌生老人识破林默的能力",
      constraint: "不揭露老人的真实身份",
    } : {},
  }))).returning();

  const activeChapter = createdChapters[2];
  const initialText = `凌晨两点十七分，急诊走廊尽头的灯闪了一下。\n\n林默抬起头。候诊区里只剩下三个人：抱着孩子的年轻母亲，捂住腹部的醉汉，以及坐在最远处、穿灰色风衣的老人。\n\n每个人头顶都悬着一串淡红色数字。\n\n六十一年，三个月。\n\n七小时，二十二分。\n\n老人头顶什么都没有。\n\n林默握住病历夹的手停在半空。这是他第二次见到这种情况。第一次，是在三年前的手术室里——镜子中的自己，同样没有数字。\n\n“林医生？”护士压低声音，“三号床等您。”\n\n他收回视线。老人却在这时抬起头，隔着半条走廊准确地看向他。\n\n“你终于来了。”老人说。`;

  await db.insert(manuscriptVersions).values({
    chapterId: activeChapter.id,
    versionNo: 1,
    contentJson: { type: "doc", text: initialText },
    contentText: initialText,
    wordCount: initialText.replace(/\s/g, "").length,
    sourceType: "seed",
  });

  await db.update(chapters).set({
    currentWords: initialText.replace(/\s/g, "").length,
    updatedAt: new Date(),
  }).where(eq(chapters.id, activeChapter.id));

  console.log("Seeded Novel Agent demo project.");
} else {
  console.log("Database already contains a project; seed skipped.");
}
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
