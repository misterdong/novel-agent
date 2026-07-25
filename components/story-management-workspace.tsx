"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Brain, Feather, Library, MapPin, Pencil, Plus, Sparkles, Target, Trash2, Users } from "lucide-react";
import { currentProjectId, projectHref } from "@/lib/project-navigation";

type ThreadStatus = "planned" | "active" | "revealed" | "paid_off" | "abandoned";
type KnowledgeState = "knows" | "believes" | "suspects" | "does_not_know";
type Thread = { id: string; title: string; truth: string; hiddenInformation: string[]; purpose: string; importance: "core" | "supporting"; revealPattern: string; status: ThreadStatus };
type PlacementStatus = "planned" | "assigned" | "written" | "verified" | "cancelled";
type Placement = { id: string; foreshadowingId: string; volumeId: string; chapterId: string | null; position: number; placementType: string; required: boolean; narrativeIntent: string; allowedInformation: Record<string, unknown>; forbiddenInformation: Record<string, unknown>; status: PlacementStatus };
type Volume = { id: string; position: number; title: string };
type Chapter = { id: string; volumeId: string; position: number; title: string };
type Event = { id: string; title: string; description: string; relativeDay: number | null; locationName: string };
type Person = { id: string; name: string };
type Knowledge = { id: string; characterId: string; proposition: string; state: KnowledgeState };

const threadLabels: Record<ThreadStatus, string> = { planned: "待规划", active: "进行中", revealed: "已揭示", paid_off: "已回收", abandoned: "已放弃" };
const placementLabels: Record<PlacementStatus, string> = { planned: "已规划", assigned: "已分配章节", written: "已写入", verified: "已验证", cancelled: "已取消" };
const placementTypeLabels: Record<string, string> = { seed: "埋设", reinforce: "强化", misdirect: "误导", reveal: "揭示", payoff: "回收", echo: "回响" };
const knowledgeLabels: Record<KnowledgeState, string> = { knows: "确定知道", believes: "相信", suspects: "怀疑", does_not_know: "尚不知道" };

export function StoryManagementWorkspace() {
  const [project, setProject] = useState<{ id: string; title: string } | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [tab, setTab] = useState<"foreshadowing" | "timeline" | "knowledge">("foreshadowing");
  const [showForm, setShowForm] = useState(false);
  const [showPlacementForm, setShowPlacementForm] = useState(false);
  const [editingThreadId, setEditingThreadId] = useState("");
  const [editingPlacementId, setEditingPlacementId] = useState("");
  const [placementThreadId, setPlacementThreadId] = useState("");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [truth, setTruth] = useState(""); const [hiddenInformation, setHiddenInformation] = useState("");
  const [importance, setImportance] = useState<"core" | "supporting">("supporting"); const [revealPattern, setRevealPattern] = useState("progressive");
  const [placementVolumeId, setPlacementVolumeId] = useState(""); const [placementChapterId, setPlacementChapterId] = useState("");
  const [placementType, setPlacementType] = useState("seed"); const [placementRequired, setPlacementRequired] = useState(false);
  const [narrativeIntent, setNarrativeIntent] = useState(""); const [allowedInformation, setAllowedInformation] = useState(""); const [forbiddenInformation, setForbiddenInformation] = useState("");
  const [relativeDay, setRelativeDay] = useState(""); const [location, setLocation] = useState("");
  const [characterId, setCharacterId] = useState(""); const [knowledgeState, setKnowledgeState] = useState<KnowledgeState>("suspects");

  async function load() {
    const response = await fetch(`/api/story-management${project?.id ? `?projectId=${project.id}` : currentProjectId() ? `?projectId=${encodeURIComponent(currentProjectId())}` : ""}`);
    if (!response.ok) return;
    const data = await response.json();
    setProject(data.project); setThreads(data.foreshadowings); setPlacements(data.placements ?? []); setVolumes(data.volumes ?? []); setChapters(data.chapters ?? []); setEvents(data.timelineEvents); setPeople(data.characters); setKnowledge(data.knowledge);
    setCharacterId((current) => current || data.characters[0]?.id || "");
  }
  useEffect(() => {
    fetch(`/api/story-management${currentProjectId() ? `?projectId=${encodeURIComponent(currentProjectId())}` : ""}`).then((response) => response.json()).then((data) => {
      setProject(data.project); setThreads(data.foreshadowings); setPlacements(data.placements ?? []); setVolumes(data.volumes ?? []); setChapters(data.chapters ?? []); setEvents(data.timelineEvents); setPeople(data.characters); setKnowledge(data.knowledge);
      setCharacterId(data.characters[0]?.id || "");
    });
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault(); if (!project) return;
    const body = tab === "foreshadowing" && editingThreadId
      ? { kind: tab, id: editingThreadId, status: threads.find((item) => item.id === editingThreadId)?.status ?? "planned", title, truth, hiddenInformation: hiddenInformation.split(/\n+/).map((item) => item.trim()).filter(Boolean), purpose: description, importance, revealPattern }
      : tab === "foreshadowing"
      ? { kind: tab, projectId: project.id, title, truth, hiddenInformation: hiddenInformation.split(/\n+/).map((item) => item.trim()).filter(Boolean), purpose: description, importance, revealPattern, status: "planned" }
      : tab === "timeline"
        ? { kind: tab, projectId: project.id, title, description, timeKind: "relative", relativeDay: relativeDay === "" ? null : Number(relativeDay), locationName: location }
        : { kind: tab, projectId: project.id, characterId, proposition: description, state: knowledgeState };
    const response = await fetch("/api/story-management", { method: editingThreadId && tab === "foreshadowing" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return;
    setTitle(""); setDescription(""); setTruth(""); setHiddenInformation(""); setRelativeDay(""); setLocation(""); setEditingThreadId(""); setShowForm(false); await load();
  }

  async function updateState(kind: "foreshadowing" | "knowledge", id: string, state: ThreadStatus | KnowledgeState) {
    await fetch("/api/story-management", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "foreshadowing" ? { kind, id, status: state } : { kind, id, state }) });
    await load();
  }

  function boundaryText(value: Record<string, unknown>) {
    const reader = value.reader;
    return Array.isArray(reader) ? reader.map(String).join("\n") : Object.values(value).flatMap((item) => Array.isArray(item) ? item.map(String) : [String(item)]).join("\n");
  }

  function openThreadForm(item?: Thread) {
    setEditingThreadId(item?.id ?? ""); setTitle(item?.title ?? ""); setTruth(item?.truth ?? ""); setHiddenInformation(item?.hiddenInformation.join("\n") ?? ""); setDescription(item?.purpose ?? ""); setImportance(item?.importance ?? "supporting"); setRevealPattern(item?.revealPattern ?? "progressive"); setShowForm(true);
  }

  function openPlacementForm(threadId: string, placement?: Placement) {
    setEditingPlacementId(placement?.id ?? ""); setPlacementThreadId(threadId); setPlacementVolumeId(placement?.volumeId ?? volumes[0]?.id ?? ""); setPlacementChapterId(placement?.chapterId ?? ""); setPlacementType(placement?.placementType ?? "seed"); setPlacementRequired(placement?.required ?? false); setNarrativeIntent(placement?.narrativeIntent ?? ""); setAllowedInformation(placement ? boundaryText(placement.allowedInformation) : ""); setForbiddenInformation(placement ? boundaryText(placement.forbiddenInformation) : ""); setShowPlacementForm(true);
  }

  async function createPlacement(event: React.FormEvent) {
    event.preventDefault(); if (!project || !placementVolumeId) return;
    const toBoundary = (value: string) => ({ reader: value.split(/\n+/).map((item) => item.trim()).filter(Boolean) });
    const body = { kind: "placement", ...(editingPlacementId ? { id: editingPlacementId, status: placements.find((item) => item.id === editingPlacementId)?.status ?? "planned" } : { projectId: project.id, foreshadowingId: placementThreadId }), volumeId: placementVolumeId, chapterId: placementChapterId || null, placementType, required: placementRequired, narrativeIntent, allowedInformation: toBoundary(allowedInformation), forbiddenInformation: toBoundary(forbiddenInformation) };
    const response = await fetch("/api/story-management", { method: editingPlacementId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return; setEditingPlacementId(""); setShowPlacementForm(false); await load();
  }

  async function updatePlacementStatus(id: string, status: PlacementStatus) {
    await fetch("/api/story-management", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "placement", id, status }) }); await load();
  }

  async function removeRecord(kind: "foreshadowing" | "placement", id: string) {
    if (!window.confirm(kind === "foreshadowing" ? "删除该伏笔及其全部规划落点？" : "删除该规划落点？")) return;
    await fetch(`/api/story-management?kind=${kind}&id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load();
  }

  return <main className="bible-shell story-shell">
    <header className="topbar bible-topbar"><div className="brand"><span className="brand-mark"><Feather size={18}/></span><span>墨境</span></div><b>{project?.title ?? "读取中…"}</b></header>
    <aside className="bible-nav"><Link href={projectHref("/", project?.id)}><BookOpen size={17}/> 创作</Link><Link href={projectHref("/outline", project?.id)}><Target size={17}/> 大纲</Link><Link href={projectHref("/bible", project?.id)}><Library size={17}/> 故事圣经</Link><span className="active"><Users size={17}/> 故事管理</span><Link href={projectHref("/generate", project?.id)}><Sparkles size={17}/> AI 生成</Link><Link href={projectHref("/autopilot", project?.id)}><Sparkles size={17}/> 自动创作</Link></aside>
    <section className="bible-main">
      <div className="bible-heading"><div><span className="card-kicker">STORY CONTROL</span><h1>故事管理</h1><p>跟踪伏笔、事件顺序，以及每个人物所知道的不同真相。</p></div><button onClick={() => tab === "foreshadowing" ? openThreadForm() : setShowForm(true)}><Plus size={15}/> 新建记录</button></div>
      <div className="story-tabs"><button className={tab === "foreshadowing" ? "active" : ""} onClick={() => setTab("foreshadowing")}>伏笔 {threads.length}</button><button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>时间线 {events.length}</button><button className={tab === "knowledge" ? "active" : ""} onClick={() => setTab("knowledge")}>人物认知 {knowledge.length}</button></div>
      {tab === "foreshadowing" && <div className="story-list foreshadowing-list">{threads.map((item) => { const itemPlacements = placements.filter((placement) => placement.foreshadowingId === item.id); return <article key={item.id}><div className="story-card-icon"><Target size={17}/></div><div><div className="entry-meta"><span className={`entry-type ${item.importance === "core" ? "core-thread" : ""}`}>{item.importance === "core" ? "核心伏笔" : "辅助伏笔"}</span><span>{item.revealPattern}</span><select value={item.status} onChange={(e) => void updateState("foreshadowing", item.id, e.target.value as ThreadStatus)}>{Object.entries(threadLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button title="编辑伏笔" onClick={() => openThreadForm(item)}><Pencil size={13}/></button><button title="添加规划落点" onClick={() => openPlacementForm(item.id)}><Plus size={13}/></button><button title="删除伏笔" onClick={() => removeRecord("foreshadowing", item.id)}><Trash2 size={13}/></button></div><h3>{item.title}</h3><p><b>目的：</b>{item.purpose || "待规划"}</p><p><b>真相：</b>{item.truth || "待规划"}</p>{item.hiddenInformation.length > 0 && <small>隐藏信息：{item.hiddenInformation.join("；")}</small>}<div className="placement-list">{itemPlacements.map((placement) => <div key={placement.id}><span>{placement.position}</span><b>{placementTypeLabels[placement.placementType] ?? placement.placementType}</b><em>{volumes.find((volume) => volume.id === placement.volumeId)?.title ?? "未知分卷"}{placement.chapterId ? ` · ${chapters.find((chapter) => chapter.id === placement.chapterId)?.title ?? "未知章节"}` : ""}</em><p>{placement.narrativeIntent || "尚未填写叙事意图"}</p>{placement.required && <small>必要节点</small>}<select value={placement.status} onChange={(e) => updatePlacementStatus(placement.id, e.target.value as PlacementStatus)}>{Object.entries(placementLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button title="编辑落点" onClick={() => openPlacementForm(item.id, placement)}><Pencil size={12}/></button><button title="删除落点" onClick={() => removeRecord("placement", placement.id)}><Trash2 size={12}/></button></div>)}{!itemPlacements.length && <p className="empty-copy">尚未安排分卷落点，可手动添加或删除该伏笔。</p>}</div></div></article>; })}{!threads.length && <p className="empty-copy">还没有伏笔记录。</p>}</div>}
      {tab === "timeline" && <div className="story-list timeline-list">{events.map((item) => <article key={item.id}><div className="timeline-day">{item.relativeDay == null ? "?" : `D${item.relativeDay >= 0 ? "+" : ""}${item.relativeDay}`}</div><div><h3>{item.title}</h3><p>{item.description || "暂无说明"}</p>{item.locationName && <small><MapPin size={11}/>{item.locationName}</small>}</div></article>)}{!events.length && <p className="empty-copy">还没有时间线事件。</p>}</div>}
      {tab === "knowledge" && <div className="story-list">{knowledge.map((item) => <article key={item.id}><div className="story-card-icon"><Brain size={17}/></div><div><div className="entry-meta"><b>{people.find((person) => person.id === item.characterId)?.name ?? "未知人物"}</b><select value={item.state} onChange={(e) => void updateState("knowledge", item.id, e.target.value as KnowledgeState)}>{Object.entries(knowledgeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><p>{item.proposition}</p></div></article>)}{!knowledge.length && <p className="empty-copy">还没有人物认知记录。</p>}</div>}
    </section>
    {showForm && <div className="dialog-backdrop" onMouseDown={() => setShowForm(false)}><form className={`create-dialog ${tab === "foreshadowing" ? "storyline-dialog" : ""}`} onSubmit={create} onMouseDown={(e) => e.stopPropagation()}><span className="card-kicker">新增{tab === "foreshadowing" ? "伏笔" : tab === "timeline" ? "事件" : "认知"}</span><h2>写入故事管理</h2>{tab !== "knowledge" && <label>名称<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}/></label>}{tab === "foreshadowing" && <><label>完整真相<textarea value={truth} onChange={(e) => setTruth(e.target.value)} placeholder="作者层面的客观真相"/></label><label>隐藏信息<textarea value={hiddenInformation} onChange={(e) => setHiddenInformation(e.target.value)} placeholder="每行一项，在揭示前不得直接暴露"/></label><label>叙事目的<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这条伏笔为什么必须存在"/></label><label>重要程度<select value={importance} onChange={(e) => setImportance(e.target.value as "core" | "supporting")}><option value="core">核心伏笔</option><option value="supporting">辅助伏笔</option></select></label><label>揭示模式<select value={revealPattern} onChange={(e) => setRevealPattern(e.target.value)}><option value="progressive">渐进揭示</option><option value="delayed">延迟揭示</option><option value="misdirection">误导后揭示</option><option value="layered">分层揭示</option><option value="false_answer_then_truth">假答案后真相</option></select></label></>}{tab === "timeline" && <><label>相对天数<input type="number" placeholder="例如 3" value={relativeDay} onChange={(e) => setRelativeDay(e.target.value)}/></label><label>地点<input value={location} onChange={(e) => setLocation(e.target.value)}/></label><label>说明<textarea value={description} onChange={(e) => setDescription(e.target.value)}/></label></>}{tab === "knowledge" && <><label>人物<select value={characterId} onChange={(e) => setCharacterId(e.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>认知状态<select value={knowledgeState} onChange={(e) => setKnowledgeState(e.target.value as KnowledgeState)}>{Object.entries(knowledgeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>认知命题<textarea autoFocus value={description} onChange={(e) => setDescription(e.target.value)}/></label></>}<div className="dialog-actions"><button type="button" onClick={() => setShowForm(false)}>取消</button><button className="dialog-primary" disabled={(tab !== "knowledge" && !title.trim()) || (tab === "knowledge" && (!characterId || !description.trim()))}>创建</button></div></form></div>}
    {showPlacementForm && <div className="dialog-backdrop" onMouseDown={() => setShowPlacementForm(false)}><form className="create-dialog storyline-dialog" onSubmit={createPlacement} onMouseDown={(e) => e.stopPropagation()}><span className="card-kicker">FORESHADOWING PLACEMENT</span><h2>添加伏笔规划落点</h2><label>分卷<select required value={placementVolumeId} onChange={(e) => { setPlacementVolumeId(e.target.value); setPlacementChapterId(""); }}>{volumes.map((volume) => <option key={volume.id} value={volume.id}>第 {volume.position} 卷 · {volume.title}</option>)}</select></label><label>章节（可稍后指定）<select value={placementChapterId} onChange={(e) => setPlacementChapterId(e.target.value)}><option value="">暂不指定章节</option>{chapters.filter((chapter) => chapter.volumeId === placementVolumeId).map((chapter) => <option key={chapter.id} value={chapter.id}>第 {chapter.position} 章 · {chapter.title}</option>)}</select></label><label>生命周期动作<select value={placementType} onChange={(e) => setPlacementType(e.target.value)}>{Object.entries(placementTypeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="checkbox-label"><input type="checkbox" checked={placementRequired} onChange={(e) => setPlacementRequired(e.target.checked)}/>不可省略的必要节点</label><label>叙事意图<textarea value={narrativeIntent} onChange={(e) => setNarrativeIntent(e.target.value)} placeholder="为什么在这里安排这次伏笔动作"/></label><label>允许暴露的信息<textarea value={allowedInformation} onChange={(e) => setAllowedInformation(e.target.value)} placeholder="每行一项"/></label><label>禁止暴露的信息<textarea value={forbiddenInformation} onChange={(e) => setForbiddenInformation(e.target.value)} placeholder="每行一项"/></label><div className="dialog-actions"><button type="button" onClick={() => setShowPlacementForm(false)}>取消</button><button className="dialog-primary" disabled={!placementVolumeId || !narrativeIntent.trim()}>创建落点</button></div></form></div>}
  </main>;
}
