"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, Feather, Library, Sparkles, Target, Users } from "lucide-react";
import { currentProjectId, projectHref } from "@/lib/project-navigation";

type Mode = "story.plan" | "story.volumes.generate" | "story.bible.generate" | "story.rolling.plan";

export function AssetGeneratorWorkspace() {
  const [project, setProject] = useState<{ id: string; title: string; genre: string } | null>(null);
  const [mode, setMode] = useState<Mode>("story.plan");
  const [brief, setBrief] = useState("");
  const [runId, setRunId] = useState("");
  const [status, setStatus] = useState("idle");
  const [output, setOutput] = useState<Record<string, unknown> | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [sourcePlan, setSourcePlan] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const requestedMode = new URLSearchParams(window.location.search).get("mode");
    const projectQuery = currentProjectId() ? `?projectId=${encodeURIComponent(currentProjectId())}` : "";
    fetch(`/api/workspace${projectQuery}`).then((response) => response.json()).then((data) => setProject({ id: data.project.id, title: data.project.title, genre: data.project.genre }));
    fetch(`/api/outline${projectQuery}`).then((response) => response.json()).then((data) => {
      setSourcePlan(data.storyPlan ?? {});
      if (requestedMode === "volumes") setMode("story.volumes.generate");
      if (requestedMode === "structure") setMode("story.rolling.plan");
    });
  }, []);

  async function generate() {
    if (!project || (!["story.volumes.generate", "story.rolling.plan"].includes(mode) && brief.trim().length < 10)) return;
    setStatus("queued"); setOutput(null); setAccepted(false); setError("");
    const response = await fetch("/api/ai/assets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, taskType: mode, brief }) });
    if (!response.ok) { const failure = await response.json(); setStatus("failed"); setError(failure.message ?? "创建生成任务失败。"); return; }
    const created = await response.json(); setRunId(created.id);
    // Asset generation uses the same durable queue as prose writing; polling can
    // survive page rendering delays without keeping an HTTP request open.
    const maxAttempts = mode === "story.rolling.plan" ? 300 : 180;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      const run = await fetch(`/api/generations?id=${created.id}`).then((item) => item.json());
      setStatus(run.status);
      if (run.status === "completed") { setOutput(run.parsedOutput); return; }
      if (run.status === "failed" || run.status === "cancelled") { setError(run.parsedOutput?.error ?? "生成失败。"); return; }
    }
    setStatus("failed"); setError("生成超时，请稍后重试。");
  }

  async function accept() {
    const response = await fetch("/api/ai/assets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) });
    if (response.ok) setAccepted(true); else { const result = await response.json().catch(() => ({})); setError(result.message ?? result.error ?? "写入正式数据失败。"); }
  }

  const destination = mode === "story.bible.generate" ? "/bible" : mode === "story.rolling.plan" ? "/outline" : "/outline";
  const isVolumeMode = mode === "story.volumes.generate";
  const isStructureMode = mode === "story.rolling.plan";
  const hasLatestPlan = sourcePlan.schemaVersion === 2;
  const canGenerate = isVolumeMode || isStructureMode ? hasLatestPlan : brief.trim().length >= 10;
  const previewTitle = mode === "story.plan" ? "大纲候选预览" : isVolumeMode ? "分卷候选预览" : isStructureMode ? "滚动规划 v2" : "故事圣经候选预览";
  return <main className="bible-shell generator-shell">
    <header className="topbar bible-topbar"><div className="brand"><span className="brand-mark"><Feather size={18}/></span><span>墨境</span></div><b>{project?.title ?? "读取中…"}</b></header>
    <aside className="bible-nav"><Link href={projectHref("/", project?.id)}><BookOpen size={17}/> 创作</Link><Link href={projectHref("/outline", project?.id)}><Target size={17}/> 大纲</Link><Link href={projectHref("/bible", project?.id)}><Library size={17}/> 故事圣经</Link><Link href={projectHref("/story", project?.id)}><Users size={17}/> 故事管理</Link><span className="active"><Sparkles size={17}/> AI 生成</span><Link href={projectHref("/autopilot", project?.id)}><Sparkles size={17}/> 自动创作</Link></aside>
    <section className="generator-main"><div className="bible-heading"><div><span className="card-kicker">AI DRAFT STUDIO</span><h1>生成故事资产草案</h1><p>这里不保存第二份大纲；AI 仅生成候选草案，确认后写入对应的正式数据。</p></div></div>
      <div className="generator-tabs"><button className={mode === "story.plan" ? "active" : ""} onClick={() => { setMode("story.plan"); setOutput(null); setAccepted(false); }}>生成大纲草案</button><button className={isVolumeMode ? "active" : ""} onClick={() => { setMode("story.volumes.generate"); setOutput(null); setAccepted(false); }}>生成分卷草案</button><button className={isStructureMode ? "active" : ""} onClick={() => { setMode("story.rolling.plan"); setOutput(null); setAccepted(false); }}>长篇滚动规划</button><button className={mode === "story.bible.generate" ? "active" : ""} onClick={() => { setMode("story.bible.generate"); setOutput(null); setAccepted(false); }}>生成圣经草案</button></div>
      {(isVolumeMode || isStructureMode) && <section className="generator-source"><span className="card-kicker">生成依据 · 正式故事总纲 v2</span><h2>{String(sourcePlan.premise ?? "尚未填写核心创意")}</h2><p>{String(sourcePlan.centralConflict ?? "尚未填写核心冲突")}</p>{isStructureMode && <small>当前阶段 → 当前卷 → 预备卷 → 近期章节窗口 → 局部伏笔落点</small>}<Link href={projectHref("/outline", project?.id)}>返回大纲修改总纲</Link></section>}
      <section className="generator-form"><label>{isVolumeMode || isStructureMode ? "补充要求（可选）" : "故事创意与生成要求"}<textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder={mode === "story.plan" ? "描述核心创意、主角、主要矛盾、希望呈现的主题和结局倾向……" : isVolumeMode ? "例如：全书分为三卷；第二卷重点推进人物关系……" : isStructureMode ? "例如：核心伏笔不超过三条；最终卷集中回收主角身份谜团……" : "描述世界背景、关键人物、能力规则，以及必须保留或禁止出现的设定……"}/></label><button onClick={generate} disabled={!canGenerate || ["queued","running"].includes(status)}><Sparkles size={15}/>{status === "queued" ? "等待 Worker" : status === "running" ? "正在生成" : isStructureMode ? "开始联合规划" : isVolumeMode ? "依据总纲生成" : "生成草案"}</button></section>
      {(isVolumeMode || isStructureMode) && !hasLatestPlan && <p className="generator-error">当前项目还没有 v2 故事总纲，请先返回大纲保存一次。</p>}{error && <p className="generator-error">{error}</p>}{output && <section className="asset-preview"><div className="asset-preview-head"><div><span className="card-kicker">待确认草案</span><h2>{previewTitle}</h2></div>{accepted ? <Link className="asset-destination" href={projectHref(destination, project?.id)}><Check size={15}/> 已写入，前往正式内容 <ArrowRight size={14}/></Link> : <button onClick={accept} disabled={isStructureMode && (output.schemaVersion !== 2 || output.acceptanceAllowed !== true || !Array.isArray(output.volumes) || !output.volumes.length)}>确认并写入正式内容</button>}</div><pre>{JSON.stringify(output, null, 2)}</pre><p>{isStructureMode ? "确认后只保留本轮最新结构：当前阶段、当前卷、预备卷、近期窗口和局部伏笔落点。" : isVolumeMode ? "确认后只更新分卷规划，不会覆盖你手写的故事总纲。" : "确认后，这份草案将成为对应模块中的正式数据。"}</p></section>}
    </section>
  </main>;
}
