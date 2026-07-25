import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { generationRuns } from "@/db/schema";
import { autopilotRuns } from "@/db/schema";
import { processAutopilot } from "@/lib/ai/process-autopilot";
import { processGeneration } from "@/lib/ai/process-generation";

const POLL_INTERVAL_MS = 500;
let stopping = false;

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

async function main() {
  console.log("AI generation worker started.");
  while (!stopping) {
    // 自动创作是一个长时间运行的状态机。优先推进最早的活动任务，
    // 避免旧项目因为新任务不断进入队列而一直得不到执行。
    const [autopilot] = await db.select({ id: autopilotRuns.id }).from(autopilotRuns)
      .where(eq(autopilotRuns.status, "running")).orderBy(asc(autopilotRuns.updatedAt)).limit(1);
    const [queuedAutopilot] = autopilot ? [] : await db.select({ id: autopilotRuns.id }).from(autopilotRuns)
      .where(eq(autopilotRuns.status, "queued")).orderBy(asc(autopilotRuns.createdAt)).limit(1);
    const selectedAutopilot = autopilot ?? queuedAutopilot;
    if (selectedAutopilot) {
      // 每次调用只推进一个已持久化阶段。即使进程随后退出，
      // 新 Worker 也能从 PostgreSQL 保存的阶段继续执行。
      await processAutopilot(selectedAutopilot.id);
      continue;
    }
    // 手动生成与自动创作共用 Worker，但只有没有自动任务时才执行，
    // 从而保证自动章节状态机能够及时推进。
    const [queued] = await db.select({ id: generationRuns.id }).from(generationRuns)
      .where(eq(generationRuns.status, "queued")).orderBy(asc(generationRuns.createdAt)).limit(1);
    if (queued) await processGeneration(queued.id);
    else await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  console.log("AI generation worker stopped.");
}

main().catch((error) => { console.error(error); process.exit(1); });
