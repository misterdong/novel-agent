"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Feather, Library, Save, Sparkles, Target, Users } from "lucide-react";
import { currentProjectId, projectHref } from "@/lib/project-navigation";

type PromptItem = { taskType: string; name: string; description: string; active: boolean; defaultPrompt: string; customPrompt: string; enabled: boolean };

export function PromptManagementWorkspace() {
  const [project, setProject] = useState<{ id: string; title: string } | null>(null);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [selected, setSelected] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const current = prompts.find((item) => item.taskType === selected);

  useEffect(() => {
    fetch(`/api/prompts${currentProjectId() ? `?projectId=${encodeURIComponent(currentProjectId())}` : ""}`).then((response) => response.json()).then((data) => {
      setProject(data.project); setPrompts(data.prompts); setSelected(data.prompts[0]?.taskType ?? "");
    });
  }, []);

  function changeCurrent(changes: Partial<PromptItem>) {
    setPrompts((items) => items.map((item) => item.taskType === selected ? { ...item, ...changes } : item));
    setSaveState("idle");
  }

  async function save() {
    if (!project || !current) return;
    setSaveState("saving");
    const response = await fetch("/api/prompts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, taskType: current.taskType, customPrompt: current.customPrompt, enabled: current.enabled }) });
    setSaveState(response.ok ? "saved" : "error");
  }

  return <main className="bible-shell prompt-shell">
    <header className="topbar bible-topbar"><div className="brand"><span className="brand-mark"><Feather size={18}/></span><span>墨境</span></div><b>{project?.title ?? "读取中…"}</b></header>
    <aside className="bible-nav"><Link href={projectHref("/", project?.id)}><BookOpen size={17}/> 创作</Link><Link href={projectHref("/outline", project?.id)}><Target size={17}/> 大纲</Link><Link href={projectHref("/bible", project?.id)}><Library size={17}/> 故事圣经</Link><Link href={projectHref("/story", project?.id)}><Users size={17}/> 故事管理</Link><span className="active"><Sparkles size={17}/> 提示词管理</span></aside>
    <section className="prompt-main">
      <div className="bible-heading"><div><span className="card-kicker">PROMPT LIBRARY</span><h1>提示词管理</h1><p>默认模板保证任务结构，用户提示词用于补充作品风格与偏好。</p></div><button onClick={save} disabled={!current || saveState === "saving"}><Save size={15}/>{saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : "保存配置"}</button></div>
      <div className="prompt-layout"><nav className="prompt-list">{prompts.map((item) => <button key={item.taskType} className={selected === item.taskType ? "active" : ""} onClick={() => setSelected(item.taskType)}><span>{item.name}<small>{item.active ? "已接入" : "待接入"}</small></span><p>{item.description}</p></button>)}</nav>
      {current && <section className="prompt-editor"><div className="prompt-meta"><div><span className="entry-type">{current.taskType}</span><h2>{current.name}</h2></div><label><input type="checkbox" checked={current.enabled} onChange={(event) => changeCurrent({ enabled: event.target.checked })}/> 启用自定义提示词</label></div><label>系统默认提示词 <small>只读，由产品维护</small><textarea className="default-prompt" readOnly value={current.defaultPrompt}/></label><label>用户自定义提示词 <small>将在默认提示词之后追加</small><textarea value={current.customPrompt} disabled={!current.enabled} onChange={(event) => changeCurrent({ customPrompt: event.target.value })} placeholder="例如：语言克制，减少解释性独白；对话单独成段……"/></label><div className="prompt-note">运行顺序：系统默认提示词 → 用户自定义提示词 → 章节与场景上下文 → 本次临时要求。</div>{saveState === "error" && <p className="dialog-error">保存失败，请稍后重试。</p>}</section>}</div>
    </section>
  </main>;
}
