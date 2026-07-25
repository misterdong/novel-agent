"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronDown, CircleStop, Feather, Library, Pause, Play, RotateCcw, Sparkles, Target, Users } from "lucide-react";
import { currentProjectId, projectHref } from "@/lib/project-navigation";

type Run = { id: string; chapterId: string | null; status: string; currentStage: string; progress: number; targetWords: number; repairCount: number; maxRepairs: number; lastMessage: string; errorMessage: string; createdAt: string };
type RunEvent = { id: string; runId: string; stage: string; eventType: string; level: string; message: string; details: Record<string, unknown>; provider: string; model: string; durationMs: number; promptTokens: number; completionTokens: number; estimatedCostMicros: number; createdAt: string };

type PlanScene = { title?: string; objective?: string; conflict?: string; outcome?: string; targetWords?: number };
type PlanDetails = { title?: string; objective?: string; conflict?: string; outcome?: string; endingHook?: string; itemCandidates?: Array<{ name?: string; storyFunction?: string; whyExistingItemsCannotServe?: string; expectedDuration?: string; relatedCharacters?: string[] }>; scenes?: PlanScene[] };
type Finding = { severity?: string; title?: string; explanation?: string; evidence?: Array<{ source?: string; quote?: string }>; suggestions?: Array<{ description?: string; replacement?: string }> };

const stageNames: Record<string, string> = { queued: "等待执行", planning_chapter: "规划章节", writing_scenes: "生成场景正文", reviewing_chapter: "质量检查", repairing_chapter: "自动修复", completing_chapter: "完成章节", completed: "已完成" };

function EventDetails({ event }: { event: RunEvent }) {
  const details = event.details ?? {};
  if (event.eventType === "chapter_plan_generated" && details.plan && typeof details.plan === "object") {
    const plan = details.plan as PlanDetails;
    return <div className="log-rich log-plan"><h4>第 {String(details.chapterPosition ?? "")} 章 · {plan.title}</h4><dl><div><dt>本章目标</dt><dd>{plan.objective || "—"}</dd></div><div><dt>核心冲突</dt><dd>{plan.conflict || "—"}</dd></div><div><dt>结果</dt><dd>{plan.outcome || "—"}</dd></div><div><dt>结尾钩子</dt><dd>{plan.endingHook || "—"}</dd></div></dl>{(plan.itemCandidates ?? []).length > 0 && <><h5>新道具候选</h5><div className="plan-item-candidates">{plan.itemCandidates?.map((item, index) => <article key={`${item.name}-${index}`}><b>{item.name}</b><p>剧情功能：{item.storyFunction}</p><p>不能复用现有道具：{item.whyExistingItemsCannotServe}</p><small>预计使用：{item.expectedDuration || "待定"}{item.relatedCharacters?.length ? ` · 关联 ${item.relatedCharacters.join("、")}` : ""}</small></article>)}</div></>}<h5>场景规划</h5><ol>{(plan.scenes ?? []).map((scene, index) => <li key={`${scene.title}-${index}`}><b>{index + 1}. {scene.title || "未命名场景"}</b><span>{scene.objective}</span>{scene.conflict && <small>冲突：{scene.conflict}</small>}{scene.outcome && <small>结果：{scene.outcome}</small>}<em>{scene.targetWords ? `${scene.targetWords} 字` : ""}</em></li>)}</ol></div>;
  }
  if (event.eventType === "scene_generated" && typeof details.prose === "string") {
    return <div className="log-rich log-prose"><div className="log-rich-title"><b>{String(details.scenePosition ?? "")} · {String(details.sceneTitle ?? "场景正文")}</b><span>{String(details.generatedWords ?? 0)} 字</span></div><p>{details.prose}</p>{Array.isArray(details.coveredEvents) && details.coveredEvents.length > 0 && <small>已覆盖：{details.coveredEvents.map(String).join("、")}</small>}</div>;
  }
  if (event.eventType === "chapter_reviewed" && Array.isArray(details.findings)) {
    const findings = details.findings as Finding[];
    return <div className="log-rich log-findings">{findings.length === 0 ? <p className="review-pass">未发现需要处理的问题，本轮检查通过。</p> : findings.map((finding, index) => <article key={`${finding.title}-${index}`}><header><span className={`finding-level ${finding.severity ?? "suggestion"}`}>{finding.severity === "error" ? "错误" : finding.severity === "warning" ? "警告" : "建议"}</span><b>{finding.title || `问题 ${index + 1}`}</b></header><p>{finding.explanation}</p>{(finding.evidence ?? []).length > 0 && <div><strong>证据</strong>{finding.evidence?.map((item, evidenceIndex) => <blockquote key={evidenceIndex}>{item.quote}<small>{item.source}</small></blockquote>)}</div>}{(finding.suggestions ?? []).length > 0 && <div><strong>修复建议</strong>{finding.suggestions?.map((item, suggestionIndex) => <p key={suggestionIndex}>{item.description}{item.replacement && <code>{item.replacement}</code>}</p>)}</div>}</article>)}</div>;
  }
  return Object.keys(details).length > 0 ? <details><summary>详细信息</summary><pre>{JSON.stringify(details, null, 2)}</pre></details> : null;
}

export function AutopilotWorkspace() {
  const [project, setProject] = useState<{ id: string; title: string } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [targetWords, setTargetWords] = useState(3000);
  const [maxRepairs, setMaxRepairs] = useState(2);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (projectId?: string) => {
    const id = projectId ?? project?.id ?? currentProjectId();
    if (!id) return;
    const response = await fetch(`/api/autopilot?projectId=${encodeURIComponent(id)}`);
    if (response.ok) { const data = await response.json(); setRuns(data.runs ?? []); setEvents(data.events ?? []); }
  }, [project?.id]);

  useEffect(() => {
    const query = currentProjectId() ? `?projectId=${encodeURIComponent(currentProjectId())}` : "";
    fetch(`/api/workspace${query}`).then((response) => response.json()).then((data) => { setProject({ id: data.project.id, title: data.project.title }); void load(data.project.id); });
  }, [load]);

  useEffect(() => {
    if (!project || !runs.some((run) => ["queued", "running"].includes(run.status))) return;
    const timer = window.setInterval(() => void load(project.id), 1200);
    return () => window.clearInterval(timer);
  }, [load, project, runs]);

  async function createRun() {
    if (!project) return;
    setCreating(true); setError("");
    const response = await fetch("/api/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, instruction, targetWords, maxRepairs }) });
    if (!response.ok) setError("无法创建自动创作任务，请确认项目已有分卷和故事总纲。");
    setCreating(false); await load(project.id);
  }

  async function action(id: string, value: "pause" | "resume" | "cancel" | "retry") {
    await fetch("/api/autopilot", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: value }) });
    if (project) await load(project.id);
  }

  const active = runs.find((run) => ["queued", "running", "paused"].includes(run.status));
  return <main className="bible-shell autopilot-shell">
    <header className="topbar bible-topbar"><div className="brand"><span className="brand-mark"><Feather size={18}/></span><span>墨境</span></div><b>{project?.title ?? "读取中…"}</b><span className="outline-saved">Autopilot · 自动创作</span></header>
    <aside className="bible-nav"><Link href={projectHref("/", project?.id)}><BookOpen size={17}/> 创作</Link><Link href={projectHref("/outline", project?.id)}><Target size={17}/> 大纲</Link><Link href={projectHref("/bible", project?.id)}><Library size={17}/> 故事圣经</Link><Link href={projectHref("/story", project?.id)}><Users size={17}/> 故事管理</Link><span className="active"><Sparkles size={17}/> 自动创作</span></aside>
    <section className="autopilot-main"><div className="bible-heading"><div><span className="card-kicker">AUTONOMOUS CHAPTER</span><h1>自动生成一章</h1><p>系统将自动完成章节规划、场景拆分、正文生成、一致性检查和有限次数修复。</p></div></div>
      {!active && <section className="autopilot-form"><div className="autopilot-fields"><label>本章附加要求（选填）<textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="例如：推进主线谜团，让主角与新人物第一次正面冲突……"/></label><label>目标字数<input type="number" min={1000} max={20000} value={targetWords} onChange={(event) => setTargetWords(Number(event.target.value))}/></label><label>最大自动修复次数<input type="number" min={0} max={5} value={maxRepairs} onChange={(event) => setMaxRepairs(Number(event.target.value))}/></label></div><div className="autopilot-warning">全自动模式会直接创建章节、写入正文、接受新人物候选并完成章节。所有正文仍保留不可变版本，可在创作页面恢复。</div>{error && <p className="generator-error">{error}</p>}<button className="autopilot-start" onClick={createRun} disabled={creating}><Sparkles size={16}/>{creating ? "正在创建…" : "开始自动生成一章"}</button></section>}
      {active && <section className="autopilot-current"><div className="autopilot-current-head"><div><span className={`run-status ${active.status}`}>{active.status}</span><h2>{stageNames[active.currentStage] ?? active.currentStage}</h2><p>{active.lastMessage}</p></div><b>{active.progress}%</b></div><div className="autopilot-progress"><i style={{ width: `${active.progress}%` }}/></div><div className="autopilot-metrics"><span>目标字数<b>{active.targetWords.toLocaleString()}</b></span><span>修复次数<b>{active.repairCount} / {active.maxRepairs}</b></span><span>当前阶段<b>{stageNames[active.currentStage] ?? active.currentStage}</b></span></div>{active.errorMessage && <p className="generator-error">{active.errorMessage}</p>}<div className="autopilot-actions">{active.status === "running" && <button onClick={() => action(active.id, "pause")}><Pause size={14}/> 暂停</button>}{active.status === "paused" && <button className="primary" onClick={() => action(active.id, "resume")}><Play size={14}/> 继续</button>}<button onClick={() => action(active.id, "cancel")}><CircleStop size={14}/> 终止</button></div></section>}
      <section className="autopilot-history"><h2>运行记录</h2>{runs.map((run) => <div className="run-history-group" key={run.id}><article><div><span className={`run-status ${run.status}`}>{run.status}</span><b>{stageNames[run.currentStage] ?? run.currentStage}</b><small>{new Date(run.createdAt).toLocaleString("zh-CN")} · {run.lastMessage}</small></div><div>{run.status === "failed" && <button onClick={() => action(run.id, "retry")}><RotateCcw size={13}/> 重试</button>}{run.chapterId && <Link href={projectHref("/", project?.id)}>查看章节</Link>}<button className={expandedRunId === run.id ? "open" : ""} onClick={() => setExpandedRunId((value) => value === run.id ? null : run.id)}>执行日志 <ChevronDown size={13}/></button></div></article>{expandedRunId === run.id && <div className="autopilot-log">{events.filter((event) => event.runId === run.id).slice().reverse().map((event) => <div className={`log-event ${event.level}`} key={event.id}><span className="log-dot"/><time>{new Date(event.createdAt).toLocaleTimeString("zh-CN")}</time><div><b>{event.message}</b><small>{stageNames[event.stage] ?? event.stage} · {event.eventType}{event.provider && ` · ${event.provider}/${event.model}`}{event.durationMs > 0 && ` · ${(event.durationMs / 1000).toFixed(1)}s`}</small><EventDetails event={event}/></div></div>)}{!events.some((event) => event.runId === run.id) && <p className="empty-copy">这次任务还没有执行日志。</p>}</div>}</div>)}{!runs.length && <p className="empty-copy">还没有自动创作记录。</p>}</section>
    </section>
  </main>;
}
