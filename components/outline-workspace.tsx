"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Feather, GitBranch, Layers3, Library, Milestone, Pencil, Plus, ScrollText, Sparkles, Target, Trash2, Users } from "lucide-react";
import { currentProjectId, projectHref, rememberProjectInUrl } from "@/lib/project-navigation";

type Chapter = { id: string; position: number; title: string; status: string; outline: Record<string, unknown> };
type Scene = { id: string; position: number; title: string; targetWords: number; outline: { objective?: string; conflict?: string; outcome?: string } };
type Volume = { id: string; position: number; title: string; objective: string; conflict: string; turningPoint: string; endingHook: string };
type Storyline = { id: string; position: number; name: string; storylineType: string; summary: string; status: string; coreQuestion: string; initialState: string; targetOutcome: string; coreConflict: string; currentProgress: string; nextPlan: string; completionCriteria: string; priority: "core" | "important" | "supporting" };
type StorylineNode = { id: string; storylineId: string; position: number; title: string; objective: string; entryCondition: string; result: string; status: "planned" | "foreshadowed" | "completed" | "cancelled" };
type PlotEvent = { id: string; position: number; title: string; description: string; cause: string; consequence: string; storylineId: string | null };
type OutlineLevel = "story" | "volumes" | "storylines" | "events" | "chapters";
const emptyStorylineDraft = { name: "", storylineType: "subplot", priority: "important" as Storyline["priority"], summary: "", coreQuestion: "", initialState: "", targetOutcome: "", coreConflict: "" };

export function OutlineWorkspace() {
  const [projectTitle, setProjectTitle] = useState("读取中…");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [active, setActive] = useState<Chapter | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [objective, setObjective] = useState("");
  const [conflict, setConflict] = useState("");
  const [outcome, setOutcome] = useState("");
  const [hook, setHook] = useState("");
  const [showScene, setShowScene] = useState(false);
  const [sceneTitle, setSceneTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [level, setLevel] = useState<OutlineLevel>("story");
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [storylines, setStorylines] = useState<Storyline[]>([]);
  const [storylineNodes, setStorylineNodes] = useState<StorylineNode[]>([]);
  const [selectedStorylineId, setSelectedStorylineId] = useState("");
  const [events, setEvents] = useState<PlotEvent[]>([]);
  const [storyPlan, setStoryPlan] = useState<Record<string, unknown>>({});
  const [rollingPlanning, setRollingPlanning] = useState<Record<string, unknown> | null>(null);
  const [storylineGenerating, setStorylineGenerating] = useState(false);
  const [showStorylineForm, setShowStorylineForm] = useState(false);
  const [storylineDraft, setStorylineDraft] = useState({ ...emptyStorylineDraft });
  const [storylineFormError, setStorylineFormError] = useState("");
  const [loadError, setLoadError] = useState("");

  async function load(chapterId?: string) {
    const requestedProjectId = projectId || currentProjectId();
    const params = new URLSearchParams(); if (requestedProjectId) params.set("projectId", requestedProjectId); if (chapterId) params.set("chapterId", chapterId);
    let response = await fetch(`/api/outline?${params}`);
    // URL 中可能残留已删除项目的 ID；此时回退到当前有效项目，避免整个页面崩溃。
    if (response.status === 404 && requestedProjectId) {
      const fallbackParams = new URLSearchParams(); if (chapterId) fallbackParams.set("chapterId", chapterId);
      response = await fetch(`/api/outline?${fallbackParams}`);
    }
    if (!response.ok) { setLoadError(response.status === 404 ? "没有可用的作品或分卷，请先创建作品。" : "大纲加载失败，请稍后重试。"); setProjectTitle("无法加载作品"); return; }
    const data = await response.json();
    if (!data?.project?.id) { setLoadError("接口未返回有效的作品数据。"); setProjectTitle("无法加载作品"); return; }
    setLoadError("");
    const nextStorylines = data.storylines ?? [];
    setProjectId(data.project.id); setProjectTitle(data.project.title); setChapters(data.chapters); setActive(data.activeChapter); setScenes(data.scenes); setVolumes(data.volumes ?? []); setStorylines(nextStorylines); setStorylineNodes(data.storylineNodes ?? []); setSelectedStorylineId((current) => nextStorylines.some((item: Storyline) => item.id === current) ? current : nextStorylines[0]?.id ?? ""); setEvents(data.events ?? []); setStoryPlan(data.storyPlan ?? {}); setRollingPlanning(data.rollingPlanning ?? null);
    if (requestedProjectId !== data.project.id) rememberProjectInUrl(data.project.id);
    const plan = data.activeChapter?.outline ?? {};
    setObjective(String(plan.objective ?? "")); setConflict(String(plan.conflict ?? "")); setOutcome(String(plan.outcome ?? "")); setHook(String(plan.endingHook ?? ""));
  }

  // 首次加载只执行一次，并统一走失效项目回退逻辑；后续刷新由用户操作显式触发。
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  async function savePlan() {
    if (!active) return;
    const outline = { ...active.outline, objective, conflict, outcome, endingHook: hook };
    await fetch("/api/outline", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "chapter", chapterId: active.id, outline }) });
    setActive({ ...active, outline });
  }

  async function createScene(event: React.FormEvent) {
    event.preventDefault(); if (!active) return;
    await fetch("/api/outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "scene", chapterId: active.id, title: sceneTitle, objective, conflict, outcome, targetWords: 1000 }) });
    setSceneTitle(""); setShowScene(false); await load(active.id);
  }

  async function updateScene(scene: Scene, changes: Record<string, unknown>) {
    await fetch(`/api/scenes/${scene.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
    if (active) await load(active.id);
  }

  async function editScene(scene: Scene) {
    const nextTitle = window.prompt("场景名称", scene.title);
    if (!nextTitle) return;
    const nextObjective = window.prompt("场景目标", scene.outline.objective ?? "");
    if (nextObjective === null) return;
    await updateScene(scene, { title: nextTitle, outline: { ...scene.outline, objective: nextObjective } });
  }

  async function deleteScene(scene: Scene) {
    if (!window.confirm(`删除场景“${scene.title}”？`)) return;
    await fetch(`/api/scenes/${scene.id}`, { method: "DELETE" });
    if (active) await load(active.id);
  }

  async function saveStoryPlan() {
    await fetch("/api/outline", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "storyPlan", projectId, storyPlan }) });
  }

  function openStorylineForm() {
    setStorylineDraft({ ...emptyStorylineDraft, storylineType: storylines.length ? "subplot" : "main", priority: storylines.length ? "important" : "core" });
    setStorylineFormError(""); setShowStorylineForm(true);
  }

  async function createStoryline(event: React.FormEvent) {
    event.preventDefault(); setStorylineFormError("");
    const response = await fetch("/api/outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "storyline", projectId, ...storylineDraft }) });
    if (!response.ok) { setStorylineFormError("创建失败，请检查名称和输入长度。"); return; }
    const created = await response.json() as Storyline;
    setShowStorylineForm(false); await load(active?.id); setSelectedStorylineId(created.id);
  }

  function updateStorylineField<K extends keyof Storyline>(key: K, value: Storyline[K]) {
    setStorylines((current) => current.map((line) => line.id === selectedStorylineId ? { ...line, [key]: value } : line));
  }

  async function saveStoryline() {
    const line = storylines.find((item) => item.id === selectedStorylineId); if (!line) return;
    await fetch("/api/outline", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "storyline", storylineId: line.id, name: line.name, storylineType: line.storylineType, summary: line.summary, coreQuestion: line.coreQuestion, initialState: line.initialState, targetOutcome: line.targetOutcome, coreConflict: line.coreConflict, currentProgress: line.currentProgress, nextPlan: line.nextPlan, completionCriteria: line.completionCriteria, priority: line.priority, status: line.status }) });
    await load(active?.id);
  }

  async function deleteStoryline() {
    const line = storylines.find((item) => item.id === selectedStorylineId); if (!line) return;
    if (!window.confirm(`确定删除故事线“${line.name}”及其全部推进节点吗？关键事件会保留，但会解除与该故事线的关联。`)) return;
    const response = await fetch(`/api/outline?kind=storyline&id=${encodeURIComponent(line.id)}`, { method: "DELETE" });
    if (!response.ok) { window.alert("删除故事线失败"); return; }
    setSelectedStorylineId(""); await load(active?.id);
  }

  async function addStorylineNode() {
    if (!selectedStorylineId) return;
    const title = window.prompt("推进节点名称"); if (!title) return;
    const objective = window.prompt("这个节点必须完成什么变化？", "") ?? "";
    const entryCondition = window.prompt("进入这个节点前必须满足什么条件？", "") ?? "";
    await fetch("/api/outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "storylineNode", storylineId: selectedStorylineId, title, objective, entryCondition, result: "" }) });
    await load(active?.id);
  }

  async function editStorylineNode(node: StorylineNode) {
    const title = window.prompt("节点名称", node.title); if (!title) return;
    const objective = window.prompt("节点目标", node.objective); if (objective === null) return;
    const entryCondition = window.prompt("进入条件", node.entryCondition); if (entryCondition === null) return;
    const result = window.prompt("实际结果（尚未发生可留空）", node.result); if (result === null) return;
    await fetch("/api/outline", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "storylineNode", nodeId: node.id, title, objective, entryCondition, result, status: node.status }) }); await load(active?.id);
  }

  async function setStorylineNodeStatus(node: StorylineNode, status: StorylineNode["status"]) {
    await fetch("/api/outline", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "storylineNode", nodeId: node.id, title: node.title, objective: node.objective, entryCondition: node.entryCondition, result: node.result, status }) }); await load(active?.id);
  }

  async function deleteStorylineNode(node: StorylineNode) {
    if (!window.confirm(`删除推进节点“${node.title}”？`)) return;
    await fetch(`/api/outline?kind=storylineNode&id=${encodeURIComponent(node.id)}`, { method: "DELETE" }); await load(active?.id);
  }

  async function generateStorylines(mode: "generate" | "refine") {
    if (mode === "refine" && !selectedStorylineId) return;
    setStorylineGenerating(true);
    try {
      const response = await fetch("/api/outline/storylines/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "generate" ? { mode, projectId } : { mode, projectId, storylineId: selectedStorylineId }) });
      const responseText = await response.text();
      let result: { message?: string } = {};
      try { result = responseText ? JSON.parse(responseText) as { message?: string } : {}; } catch { result = { message: responseText }; }
      if (!response.ok) { window.alert(result.message || `AI 故事线生成失败（${response.status}）`); return; }
      await load(active?.id);
    } catch (error) {
      window.alert(error instanceof Error ? `AI 故事线生成失败：${error.message}` : "AI 故事线生成失败");
    } finally { setStorylineGenerating(false); }
  }

  async function addEvent() {
    const title = window.prompt("关键事件名称"); if (!title) return;
    const description = window.prompt("事件发生了什么", "") ?? ""; const cause = window.prompt("事件的直接原因", "") ?? ""; const consequence = window.prompt("事件造成的后果", "") ?? "";
    await fetch("/api/outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "event", projectId, title, description, cause, consequence, storylineId: storylines[0]?.id ?? null }) }); await load(active?.id);
  }

  function setStoryField(key: string, value: string) { setStoryPlan((current) => ({ ...current, [key]: value })); }

  const selectedStoryline = storylines.find((item) => item.id === selectedStorylineId) ?? null;
  const selectedNodes = storylineNodes.filter((node) => node.storylineId === selectedStorylineId).sort((a, b) => a.position - b.position);

  return <main className="outline-shell">
    <header className="topbar outline-topbar"><div className="brand"><span className="brand-mark"><Feather size={18} /></span><span>墨境</span></div><b>{projectTitle}</b><span className="outline-saved">五层故事大纲</span></header>
    <aside className="bible-nav"><Link href={projectHref("/", projectId)}><BookOpen size={17}/> 创作</Link><span className="active"><Target size={17}/> 大纲</span><Link href={projectHref("/bible", projectId)}><Library size={17}/> 故事圣经</Link><Link href={projectHref("/story", projectId)}><Users size={17}/> 故事管理</Link><Link href={projectHref("/generate", projectId)}><Sparkles size={17}/> AI 生成</Link><Link href={projectHref("/autopilot", projectId)}><Sparkles size={17}/> 自动创作</Link></aside>
    <aside className="outline-chapters outline-levels"><span className="card-kicker">大纲层级</span>{([{ id:"story",label:"故事总纲",icon:ScrollText },{ id:"volumes",label:"分卷规划",icon:Layers3 },{ id:"storylines",label:"故事线",icon:GitBranch },{ id:"events",label:"关键事件",icon:Milestone },{ id:"chapters",label:"章节规划",icon:Target }] as const).map((item) => <button key={item.id} className={level === item.id ? "active" : ""} onClick={() => setLevel(item.id)}><item.icon size={15}/><span><b>{item.label}</b><em>{item.id === "chapters" ? `${chapters.length} 章` : item.id === "volumes" ? `${volumes.length} 卷` : item.id === "storylines" ? `${storylines.length} 条` : item.id === "events" ? `${events.length} 个` : "全书战略"}</em></span></button>)}{level === "chapters" && <div className="level-chapters">{chapters.map((chapter) => <button key={chapter.id} className={chapter.id === active?.id ? "active" : ""} onClick={() => load(chapter.id)}><small>{chapter.position}</small><span><b>{chapter.title}</b><em>{chapter.status}</em></span></button>)}</div>}</aside>
    <section className="outline-editor">
      {loadError && <div className="empty-copy"><p>{loadError}</p><Link href="/">返回创作页</Link></div>}
      {level === "story" && <><div className="outline-heading"><div><span className="card-kicker">STORY MASTER PLAN</span><h1>故事总纲</h1></div><button onClick={saveStoryPlan}>保存总纲</button></div><p className="outline-intro">定义整本小说为什么成立，以及最终要抵达哪里。</p><div className="plan-grid story-plan-grid"><label>核心创意<textarea value={String(storyPlan.premise ?? "")} onChange={(e) => setStoryField("premise", e.target.value)} placeholder="用一句话说明故事最独特的设定"/></label><label>主题与命题<textarea value={Array.isArray(storyPlan.theme) ? storyPlan.theme.join("、") : String(storyPlan.theme ?? "")} onChange={(e) => setStoryPlan((current) => ({ ...current, theme: e.target.value.split(/[、，,]/).filter(Boolean) }))} placeholder="小说最终讨论什么？"/></label><label>开篇事件<textarea value={String(storyPlan.opening_event ?? "")} onChange={(e) => setStoryField("opening_event", e.target.value)} placeholder="打破主角原有生活、让故事正式启动的事件"/></label><label>开篇钩子<textarea value={String(storyPlan.opening_hook ?? "")} onChange={(e) => setStoryField("opening_hook", e.target.value)} placeholder="开篇最先抓住读者的异常、危机或承诺"/></label><label>初始目标<textarea value={String(storyPlan.initial_goal ?? "")} onChange={(e) => setStoryField("initial_goal", e.target.value)} placeholder="主角在故事前期最直接、可执行的目标"/></label><label>核心爽点<textarea value={String(storyPlan.core_payoff ?? "")} onChange={(e) => setStoryField("core_payoff", e.target.value)} placeholder="读者会持续获得的核心满足与兑现方式"/></label><label>长期悬念<textarea value={String(storyPlan.long_term_mystery ?? "")} onChange={(e) => setStoryField("long_term_mystery", e.target.value)} placeholder="需要跨越多个阶段逐步揭晓的核心问题"/></label><label>核心冲突<textarea value={String(storyPlan.centralConflict ?? "")} onChange={(e) => setStoryField("centralConflict", e.target.value)}/></label><label>主角成长弧<textarea value={String(storyPlan.protagonistArc ?? "")} onChange={(e) => setStoryField("protagonistArc", e.target.value)}/></label><label>世界概述<textarea value={String(storyPlan.worldSummary ?? "")} onChange={(e) => setStoryField("worldSummary", e.target.value)}/></label><label>结局方向<textarea value={String(storyPlan.endingDirection ?? "")} onChange={(e) => setStoryField("endingDirection", e.target.value)}/></label></div></>}
      {level === "volumes" && <><div className="outline-heading"><div><span className="card-kicker">VOLUME ARC</span><h1>分卷规划</h1></div><Link className="outline-action-link" href={projectId ? `/generate?projectId=${encodeURIComponent(projectId)}&mode=volumes` : "/generate?mode=volumes"}>依据总纲生成分卷</Link></div><p className="outline-intro">每卷形成一个阶段性小故事，并改变人物和主线状态。</p><div className="structure-grid">{volumes.map((volume) => <article key={volume.id}><span>第 {volume.position} 卷</span><h2>{volume.title}</h2><dl className="volume-plan-details"><div><dt>阶段目标</dt><dd>{volume.objective || "尚未规划"}</dd></div><div><dt>核心冲突</dt><dd>{volume.conflict || "尚未规划"}</dd></div><div><dt>关键转折</dt><dd>{volume.turningPoint || "尚未规划"}</dd></div><div><dt>结尾钩子</dt><dd>{volume.endingHook || "尚未规划"}</dd></div></dl></article>)}</div></>}
      {level === "storylines" && <><div className="outline-heading"><div><span className="card-kicker">STORYLINES</span><h1>故事线</h1></div><div className="outline-heading-actions"><button disabled={storylineGenerating} onClick={() => generateStorylines("generate")}><Sparkles size={14}/> {storylineGenerating ? "生成中…" : "AI 生成故事线"}</button><button onClick={openStorylineForm}><Plus size={14}/> 新建故事线</button></div></div><p className="outline-intro">用持续变化的故事线和有顺序的推进节点，约束长篇创作方向。</p><div className="storyline-workspace"><aside className="storyline-list">{storylines.map((item) => { const count = storylineNodes.filter((node) => node.storylineId === item.id); return <button key={item.id} className={item.id === selectedStorylineId ? "active" : ""} onClick={() => setSelectedStorylineId(item.id)}><small>{item.storylineType} · {item.priority}</small><b>{item.name}</b><span>{count.filter((node) => node.status === "completed").length} / {count.length} 个节点</span></button>; })}{!storylines.length && <p className="empty-copy">还没有故事线。</p>}</aside>{selectedStoryline && <div className="storyline-detail"><div className="storyline-detail-actions"><h2>{selectedStoryline.name}</h2><div><button className="storyline-delete" onClick={deleteStoryline}><Trash2 size={13}/> 删除</button><button disabled={storylineGenerating} onClick={() => generateStorylines("refine")}><Sparkles size={13}/> AI 细化节点</button><button onClick={saveStoryline}>保存故事线</button></div></div><div className="plan-grid storyline-fields"><label>名称<input value={selectedStoryline.name} onChange={(e) => updateStorylineField("name", e.target.value)}/></label><label>类型<select value={selectedStoryline.storylineType} onChange={(e) => updateStorylineField("storylineType", e.target.value)}><option value="main">主线</option><option value="character">人物成长线</option><option value="relationship">关系线</option><option value="mystery">悬念线</option><option value="world">世界线</option><option value="subplot">支线</option></select></label><label>优先级<select value={selectedStoryline.priority} onChange={(e) => updateStorylineField("priority", e.target.value as Storyline["priority"])}><option value="core">核心</option><option value="important">重要</option><option value="supporting">辅助</option></select></label><label>状态<select value={selectedStoryline.status} onChange={(e) => updateStorylineField("status", e.target.value)}><option value="planned">未开始</option><option value="active">推进中</option><option value="paused">暂时搁置</option><option value="completed">已完成</option><option value="abandoned">已放弃</option></select></label><label>故事线简介<textarea value={selectedStoryline.summary} onChange={(e) => updateStorylineField("summary", e.target.value)}/></label><label>核心命题<textarea value={selectedStoryline.coreQuestion} onChange={(e) => updateStorylineField("coreQuestion", e.target.value)}/></label><label>起始状态<textarea value={selectedStoryline.initialState} onChange={(e) => updateStorylineField("initialState", e.target.value)}/></label><label>最终目标<textarea value={selectedStoryline.targetOutcome} onChange={(e) => updateStorylineField("targetOutcome", e.target.value)}/></label><label>核心冲突<textarea value={selectedStoryline.coreConflict} onChange={(e) => updateStorylineField("coreConflict", e.target.value)}/></label><label>当前进度<textarea value={selectedStoryline.currentProgress} onChange={(e) => updateStorylineField("currentProgress", e.target.value)}/></label><label>下一步计划<textarea value={selectedStoryline.nextPlan} onChange={(e) => updateStorylineField("nextPlan", e.target.value)}/></label><label>完成条件<textarea value={selectedStoryline.completionCriteria} onChange={(e) => updateStorylineField("completionCriteria", e.target.value)}/></label></div><div className="scene-heading"><div><h2>推进节点</h2><p>节点表示计划中的阶段变化，不代表正文里已经发生。</p></div><button onClick={addStorylineNode}><Plus size={14}/> 添加节点</button></div><div className="storyline-node-list">{selectedNodes.map((node) => <article key={node.id}><span>{node.position}</span><div><small>{node.status}</small><h3>{node.title}</h3><p>{node.objective || "尚未填写节点目标"}</p>{node.entryCondition && <em>进入条件：{node.entryCondition}</em>}</div><select value={node.status} onChange={(e) => setStorylineNodeStatus(node, e.target.value as StorylineNode["status"])}><option value="planned">待推进</option><option value="foreshadowed">已铺垫</option><option value="completed">已发生</option><option value="cancelled">已取消</option></select><button title="编辑节点" onClick={() => editStorylineNode(node)}><Pencil size={13}/></button><button title="删除节点" onClick={() => deleteStorylineNode(node)}><Trash2 size={13}/></button></article>)}{!selectedNodes.length && <p className="empty-copy">还没有推进节点。</p>}</div></div>}</div></>}
      {level === "events" && <><div className="outline-heading"><div><span className="card-kicker">CAUSAL EVENTS</span><h1>关键事件</h1></div><button onClick={addEvent}><Plus size={14}/> 新建事件</button></div><p className="outline-intro">事件用因果连接故事，避免剧情变成无关联的事情清单。</p><div className="event-chain">{events.map((item) => <article key={item.id}><span>{item.position}</span><div><h2>{item.title}</h2><p>{item.description}</p><small>原因：{item.cause || "待补充"} → 后果：{item.consequence || "待补充"}</small></div></article>)}{!events.length && <p className="empty-copy">还没有关键事件。</p>}</div></>}
      {level === "chapters" && active && <><div className="outline-heading"><div><span className="card-kicker">第 {active.position} 章</span><h1>{active.title}</h1></div><button onClick={savePlan}>保存章节卡</button></div><p className="outline-intro">章节卡是上层结构落到正文的执行单元。</p><div className="plan-grid"><label>本章目标<textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="本章必须完成什么？" /></label><label>核心冲突<textarea value={conflict} onChange={(event) => setConflict(event.target.value)} placeholder="谁阻止谁获得什么？" /></label><label>章节结果<textarea value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="结束时发生了什么变化？" /></label><label>结尾钩子<textarea value={hook} onChange={(event) => setHook(event.target.value)} placeholder="读者为什么要打开下一章？" /></label></div><div className="scene-heading"><div><h2>场景计划</h2><p>场景结束后应至少改变信息、决定、关系或风险中的一项。</p></div><button onClick={() => setShowScene(true)}><Plus size={14}/> 添加场景</button></div><div className="scene-list">{scenes.map((scene) => <article key={scene.id}><span>{scene.position}</span><div><h3>{scene.title}</h3><p>{scene.outline.objective || "尚未填写场景目标"}</p></div><small>{scene.targetWords} 字</small><div className="scene-actions"><button title="上移" onClick={() => updateScene(scene, { move: "up" })}><ArrowUp size={13}/></button><button title="下移" onClick={() => updateScene(scene, { move: "down" })}><ArrowDown size={13}/></button><button title="编辑" onClick={() => editScene(scene)}><Pencil size={13}/></button><button title="删除" onClick={() => deleteScene(scene)}><Trash2 size={13}/></button></div></article>)}{scenes.length === 0 && <p className="empty-copy">还没有场景，请先保存章节卡并添加第一个场景。</p>}</div></>}
    </section>
    {showScene && <div className="dialog-backdrop" onMouseDown={() => setShowScene(false)}><form className="create-dialog" onSubmit={createScene} onMouseDown={(event) => event.stopPropagation()}><span className="card-kicker">新场景</span><h2>添加场景计划</h2><label>场景名称<input autoFocus value={sceneTitle} onChange={(event) => setSceneTitle(event.target.value)} placeholder="例如：急诊走廊的会面" /></label><p className="form-hint">场景将继承当前章节卡的目标、冲突与结果，后续可以独立细化。</p><div className="dialog-actions"><button type="button" onClick={() => setShowScene(false)}>取消</button><button className="dialog-primary" disabled={!sceneTitle.trim()}>创建</button></div></form></div>}
    {showStorylineForm && <div className="dialog-backdrop" onMouseDown={() => setShowStorylineForm(false)}><form className="create-dialog storyline-dialog" onSubmit={createStoryline} onMouseDown={(event) => event.stopPropagation()}><span className="card-kicker">NEW STORYLINE</span><h2>新建故事线</h2><div className="storyline-dialog-grid"><label>名称<input autoFocus required value={storylineDraft.name} onChange={(e) => setStorylineDraft((current) => ({ ...current, name: e.target.value }))} placeholder="例如：失踪案调查线"/></label><label>类型<select value={storylineDraft.storylineType} onChange={(e) => setStorylineDraft((current) => ({ ...current, storylineType: e.target.value }))}><option value="main">主线</option><option value="character">人物成长线</option><option value="relationship">关系线</option><option value="mystery">悬念线</option><option value="world">世界线</option><option value="subplot">支线</option></select></label><label>优先级<select value={storylineDraft.priority} onChange={(e) => setStorylineDraft((current) => ({ ...current, priority: e.target.value as Storyline["priority"] }))}><option value="core">核心</option><option value="important">重要</option><option value="supporting">辅助</option></select></label><label className="dialog-wide">简介<textarea value={storylineDraft.summary} onChange={(e) => setStorylineDraft((current) => ({ ...current, summary: e.target.value }))} placeholder="概括这条故事线的起点、方向与作用"/></label><label>核心命题<textarea value={storylineDraft.coreQuestion} onChange={(e) => setStorylineDraft((current) => ({ ...current, coreQuestion: e.target.value }))}/></label><label>起始状态<textarea value={storylineDraft.initialState} onChange={(e) => setStorylineDraft((current) => ({ ...current, initialState: e.target.value }))}/></label><label>最终目标<textarea value={storylineDraft.targetOutcome} onChange={(e) => setStorylineDraft((current) => ({ ...current, targetOutcome: e.target.value }))}/></label><label>核心冲突<textarea value={storylineDraft.coreConflict} onChange={(e) => setStorylineDraft((current) => ({ ...current, coreConflict: e.target.value }))}/></label></div>{storylineFormError && <p className="dialog-error">{storylineFormError}</p>}<div className="dialog-actions"><button type="button" onClick={() => setShowStorylineForm(false)}>取消</button><button className="dialog-primary" disabled={!storylineDraft.name.trim()}>创建故事线</button></div></form></div>}
  </main>;
}
