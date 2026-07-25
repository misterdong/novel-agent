"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Feather, Library, Lock, Package, Pencil, Plus, Sparkles, Target, UserRound, Users } from "lucide-react";
import { currentProjectId, projectHref } from "@/lib/project-navigation";

type Entry = { id: string; entryType: string; name: string; summary: string; strength: "soft" | "hard" };
type CharacterProfile = { gender?: string; age?: string | number; role?: string; personality?: string; appearance?: string; background?: string; occupation?: string; faction?: string; archetype?: string; flaw?: string; fear?: string; secret?: string; arcStart?: string; arcTarget?: string; speechStyle?: string; status?: string };
type Character = { id: string; name: string; aliases: string[]; coreDesire: string; externalGoal: string; internalNeed: string; behaviorConstraints: string[]; profile: CharacterProfile };
type CharacterCandidate = CharacterProfile & { name: string; aliases?: string[]; coreDesire?: string; externalGoal?: string; internalNeed?: string; behaviorConstraints?: string[] };
type StoryItem = { id: string; name: string; itemType: string; description: string; holderCharacterId: string | null; currentLocation: string; status: string; storyFunction: string; nextPlan: string; importance: number };
type Relationship = { id: string; characterAId: string; characterBId: string; relationType: string; status: string; aToBAttitude: string; bToAAttitude: string; description: string; nextDirection: string };

export function StoryBibleWorkspace() {
  const [project, setProject] = useState<{ id: string; title: string } | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [items, setItems] = useState<StoryItem[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [kind, setKind] = useState<"entry" | "character">("entry");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [characterProfile, setCharacterProfile] = useState<CharacterProfile>({});
  const [externalGoal, setExternalGoal] = useState("");
  const [entryType, setEntryType] = useState("rule");
  const [strength, setStrength] = useState<"soft" | "hard">("hard");
  const [showForm, setShowForm] = useState(false);
  const [showAiCharacter, setShowAiCharacter] = useState(false);
  const [characterInstruction, setCharacterInstruction] = useState("");
  const [characterGenerationMode, setCharacterGenerationMode] = useState<"specified" | "candidates">("specified");
  const [characterCandidates, setCharacterCandidates] = useState<CharacterCandidate[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<string[]>([]);
  const [characterGenerating, setCharacterGenerating] = useState(false);
  const [characterError, setCharacterError] = useState("");
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [characterDraft, setCharacterDraft] = useState<Character | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [relationshipDraft, setRelationshipDraft] = useState<Partial<Relationship> | null>(null);
  const [relationshipError, setRelationshipError] = useState("");

  async function load() {
    const response = await fetch(`/api/story-bible${project?.id ? `?projectId=${project.id}` : currentProjectId() ? `?projectId=${encodeURIComponent(currentProjectId())}` : ""}`);
    if (!response.ok) return;
    const data = await response.json();
    setProject(data.project); setEntries(data.entries); setCharacters(data.characters); setItems(data.items ?? []); setRelationships(data.relationships ?? []);
  }

  useEffect(() => {
    fetch(`/api/story-bible${currentProjectId() ? `?projectId=${encodeURIComponent(currentProjectId())}` : ""}`).then((response) => response.json()).then((data) => {
      setProject(data.project); setEntries(data.entries); setCharacters(data.characters); setItems(data.items ?? []); setRelationships(data.relationships ?? []);
    });
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!project) return;
    const body = kind === "entry"
      ? { kind, projectId: project.id, entryType, name, summary, strength }
      : { kind, projectId: project.id, name, coreDesire: summary, externalGoal, profile: characterProfile };
    const response = await fetch("/api/story-bible", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return;
    setName(""); setSummary(""); setExternalGoal(""); setCharacterProfile({}); setShowForm(false); await load();
  }

  async function generateCharacters() {
    if (!project) return;
    setCharacterGenerating(true); setCharacterError(""); setCharacterCandidates([]);
    if (characterGenerationMode === "specified" && characterInstruction.trim().length < 10) { setCharacterError("请先填写需要提炼的人物描写。"); setCharacterGenerating(false); return; }
    const response = await fetch("/api/story-bible/characters/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, mode: characterGenerationMode, instruction: characterInstruction }) });
    const data = await response.json();
    if (response.ok) {
      const candidates = (data.characters ?? []).slice(0, characterGenerationMode === "specified" ? 1 : 3) as CharacterCandidate[];
      setCharacterCandidates(candidates);
      // Generated candidates start selected so the default path is one-click batch
      // approval, while every character still remains under explicit user control.
      setSelectedCharacters(candidates.map((item) => item.name));
    } else setCharacterError(data.message ?? "人物生成失败。");
    setCharacterGenerating(false);
  }

  async function acceptCharacter(candidate: CharacterCandidate) {
    if (!project) return;
    const response = await fetch("/api/story-bible", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "character", projectId: project.id, name: candidate.name, aliases: candidate.aliases ?? [], coreDesire: candidate.coreDesire ?? "", externalGoal: candidate.externalGoal ?? "", internalNeed: candidate.internalNeed ?? "", behaviorConstraints: candidate.behaviorConstraints ?? [], profile: { gender: candidate.gender ?? "", age: candidate.age ?? "", role: candidate.role ?? "", personality: candidate.personality ?? "", appearance: candidate.appearance ?? "", background: candidate.background ?? "", occupation: candidate.occupation ?? "", faction: candidate.faction ?? "", archetype: candidate.archetype ?? "", flaw: candidate.flaw ?? "", fear: candidate.fear ?? "", secret: candidate.secret ?? "", arcStart: candidate.arcStart ?? "", arcTarget: candidate.arcTarget ?? "", speechStyle: candidate.speechStyle ?? "" } }) });
    if (!response.ok) return setCharacterError(`无法保存人物“${candidate.name}”，可能存在同名人物。`);
    setCharacterCandidates((items) => items.filter((item) => item !== candidate));
    await load();
  }

  function toggleCharacter(name: string) {
    setSelectedCharacters((items) => items.includes(name) ? items.filter((item) => item !== name) : [...items, name]);
  }

  async function acceptSelectedCharacters() {
    const selected = characterCandidates.filter((candidate) => selectedCharacters.includes(candidate.name));
    for (const candidate of selected) await acceptCharacter(candidate);
    setSelectedCharacters([]);
  }

  function openCharacter(person: Character) {
    setEditingCharacter(person); setCharacterDraft(structuredClone(person)); setDetailError(""); setRefineInstruction("");
  }

  async function saveCharacter() {
    if (!characterDraft) return;
    setDetailError("");
    const response = await fetch("/api/story-bible", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "character", ...characterDraft }) });
    const data = await response.json();
    if (!response.ok) return setDetailError(data.message ?? "人物档案保存失败，请检查字段内容。");
    setEditingCharacter(data); setCharacterDraft(data); await load();
  }

  async function refineCharacter() {
    if (!project || !characterDraft) return;
    setRefining(true); setDetailError("");
    const response = await fetch("/api/story-bible/characters/refine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, characterId: characterDraft.id, instruction: refineInstruction }) });
    const data = await response.json();
    if (!response.ok) { setDetailError(data.message ?? "AI 完善人物失败。"); setRefining(false); return; }
    const candidate = data.character as CharacterCandidate;
    setCharacterDraft((current) => current ? { ...current, aliases: candidate.aliases?.length ? candidate.aliases : current.aliases, coreDesire: candidate.coreDesire || current.coreDesire, externalGoal: candidate.externalGoal || current.externalGoal, internalNeed: candidate.internalNeed || current.internalNeed, behaviorConstraints: candidate.behaviorConstraints?.length ? candidate.behaviorConstraints : current.behaviorConstraints, profile: { ...current.profile, ...Object.fromEntries(Object.entries(candidate).filter(([key, value]) => ["gender","age","role","personality","appearance","background","occupation","faction","archetype","flaw","fear","secret","arcStart","arcTarget","speechStyle"].includes(key) && value !== "" && value != null)) } } : current);
    setRefining(false);
  }

  function newRelationship() {
    setRelationshipError(""); setRelationshipDraft({ characterAId: characters[0]?.id ?? "", characterBId: characters[1]?.id ?? "", relationType: "陌生", status: "接触", aToBAttitude: "", bToAAttitude: "", description: "", nextDirection: "" });
  }

  async function saveRelationship() {
    if (!project || !relationshipDraft?.characterAId || !relationshipDraft.characterBId) return;
    setRelationshipError("");
    const editing = Boolean(relationshipDraft.id);
    const response = await fetch("/api/story-bible", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { kind: "relationship", ...relationshipDraft } : { kind: "relationship", projectId: project.id, ...relationshipDraft }) });
    const data = await response.json();
    if (!response.ok) return setRelationshipError(data.message ?? "关系保存失败，可能已经存在相同人物组合。");
    setRelationshipDraft(null); await load();
  }

  return <main className="bible-shell">
    <header className="topbar bible-topbar"><div className="brand"><span className="brand-mark"><Feather size={18} /></span><span>墨境</span></div><b>{project?.title ?? "读取中…"}</b></header>
    <aside className="bible-nav">
      <Link href={projectHref("/", project?.id)}><BookOpen size={17} /> 创作</Link>
      <Link href={projectHref("/outline", project?.id)}><Target size={17} /> 大纲</Link>
      <span className="active"><Library size={17} /> 故事圣经</span>
      <Link href={projectHref("/story", project?.id)}><Users size={17} /> 故事管理</Link>
      <Link href={projectHref("/generate", project?.id)}><Sparkles size={17} /> AI 生成</Link>
      <Link href={projectHref("/autopilot", project?.id)}><Sparkles size={17} /> 自动创作</Link>
    </aside>
    <section className="bible-main">
      <div className="bible-heading"><div><span className="card-kicker">STORY BIBLE</span><h1>故事圣经</h1><p>这里的硬性设定会成为 AI 写作不可违反的约束。</p></div><div className="bible-heading-actions"><button className="secondary" onClick={() => setShowAiCharacter(true)}><Sparkles size={15}/> AI 生成人物</button><button onClick={() => setShowForm(true)}><Plus size={15} /> 新建条目</button></div></div>
      <div className="bible-section"><h2><UserRound size={17} /> 人物 <small>{characters.length}</small></h2><div className="bible-grid character-grid">{characters.map((person) => <article key={person.id} className="character-card" onClick={() => openCharacter(person)}><div className="character-card-meta"><span className="entry-type">{person.profile?.role || "人物"}</span><small>{[person.profile?.gender, person.profile?.age !== undefined && person.profile?.age !== "" ? `${person.profile.age}岁` : "", person.profile?.status].filter(Boolean).join(" · ") || "属性待补充"}</small></div><h3>{person.name}</h3>{person.profile?.occupation && <p><b>身份：</b>{person.profile.occupation}{person.profile.faction ? ` · ${person.profile.faction}` : ""}</p>}<p><b>核心欲望：</b>{person.coreDesire || "尚未填写"}</p>{person.profile?.flaw && <p><b>致命缺陷：</b>{person.profile.flaw}</p>}<span className="character-edit-hint"><Pencil size={11}/> 查看与编辑</span></article>)}{characters.length === 0 && <p className="empty-copy">还没有人物卡。</p>}</div></div>
      <div className="bible-section"><div className="section-title-row"><h2><Users size={17}/> 人物关系 <small>{relationships.length}</small></h2><button onClick={newRelationship} disabled={characters.length < 2}><Plus size={13}/> 新增关系</button></div><p className="section-hint">记录客观关系、当前阶段，以及双方并不一定相同的态度。</p><div className="relationship-list">{relationships.map((relation) => { const a = characters.find((person) => person.id === relation.characterAId); const b = characters.find((person) => person.id === relation.characterBId); return <article key={relation.id} onClick={() => { setRelationshipError(""); setRelationshipDraft({ ...relation }); }}><div className="relationship-pair"><b>{a?.name ?? "未知人物"}</b><span>{relation.relationType} · {relation.status}</span><b>{b?.name ?? "未知人物"}</b></div><div className="relationship-attitudes"><p><strong>{a?.name} → {b?.name}</strong>{relation.aToBAttitude || "态度待补充"}</p><p><strong>{b?.name} → {a?.name}</strong>{relation.bToAAttitude || "态度待补充"}</p></div>{relation.nextDirection && <small>下一步：{relation.nextDirection}</small>}</article>; })}{relationships.length === 0 && <p className="empty-copy">还没有正式人物关系。可以手动新增，也可以从章节记忆提案中接受。</p>}</div></div>
      <div className="bible-section"><h2><Package size={17}/> 剧情道具 <small>{items.length}</small></h2><p className="section-hint">只追踪会改变剧情、承载线索或在后续继续使用的重要物品。</p><div className="bible-grid item-grid">{items.map((item) => <article key={item.id}><div className="entry-meta"><span className="entry-type">{item.itemType || "剧情道具"}</span><span className={`item-status ${item.status}`}>{item.status}</span></div><h3>{item.name}</h3><p>{item.description || "暂无说明"}</p><dl><div><dt>当前持有</dt><dd>{characters.find((person) => person.id === item.holderCharacterId)?.name ?? "无人持有"}</dd></div><div><dt>当前位置</dt><dd>{item.currentLocation || "未知"}</dd></div></dl>{item.storyFunction && <p><b>剧情作用：</b>{item.storyFunction}</p>}{item.nextPlan && <p><b>下一步：</b>{item.nextPlan}</p>}</article>)}{items.length === 0 && <p className="empty-copy">还没有经过确认的剧情道具。完成章节记忆提取后，可接受“剧情道具”候选。</p>}</div></div>
      <div className="bible-section"><h2><Sparkles size={17} /> 世界与规则 <small>{entries.length}</small></h2><div className="bible-grid">{entries.map((entry) => <article key={entry.id}><div className="entry-meta"><span className="entry-type">{entry.entryType}</span>{entry.strength === "hard" && <span className="hard-rule"><Lock size={11} /> 硬性</span>}</div><h3>{entry.name}</h3><p>{entry.summary || "暂无详细说明"}</p></article>)}{entries.length === 0 && <p className="empty-copy">还没有世界设定。</p>}</div></div>
    </section>
    {showForm && <div className="dialog-backdrop" onMouseDown={() => setShowForm(false)}><form className="create-dialog character-create-dialog" onSubmit={create} onMouseDown={(event) => event.stopPropagation()}><span className="card-kicker">新建故事资产</span><h2>添加到故事圣经</h2><label>类型<select value={kind} onChange={(event) => setKind(event.target.value as "entry" | "character")}><option value="entry">世界设定</option><option value="character">人物</option></select></label>{kind === "entry" && <><label>分类<select value={entryType} onChange={(event) => setEntryType(event.target.value)}><option value="rule">世界规则</option><option value="location">地点</option><option value="faction">势力</option><option value="item">物品</option><option value="ability">能力</option></select></label><label>约束强度<select value={strength} onChange={(event) => setStrength(event.target.value as "soft" | "hard")}><option value="hard">硬性设定</option><option value="soft">软性参考</option></select></label></>}<label>名称<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>{kind === "character" && <div className="character-profile-fields"><label>性别<input value={characterProfile.gender ?? ""} onChange={(event) => setCharacterProfile((value) => ({ ...value, gender: event.target.value }))}/></label><label>年龄<input value={characterProfile.age ?? ""} onChange={(event) => setCharacterProfile((value) => ({ ...value, age: event.target.value }))}/></label><label>故事角色<input value={characterProfile.role ?? ""} onChange={(event) => setCharacterProfile((value) => ({ ...value, role: event.target.value }))} placeholder="主角、配角、反派……"/></label><label>性格<input value={characterProfile.personality ?? ""} onChange={(event) => setCharacterProfile((value) => ({ ...value, personality: event.target.value }))}/></label></div>}<label>{kind === "character" ? "核心欲望" : "说明"}<textarea value={summary} onChange={(event) => setSummary(event.target.value)} /></label>{kind === "character" && <><label>外部目标<textarea value={externalGoal} onChange={(event) => setExternalGoal(event.target.value)}/></label><label>外貌<textarea value={characterProfile.appearance ?? ""} onChange={(event) => setCharacterProfile((value) => ({ ...value, appearance: event.target.value }))}/></label><label>人物背景<textarea value={characterProfile.background ?? ""} onChange={(event) => setCharacterProfile((value) => ({ ...value, background: event.target.value }))}/></label></>}<div className="dialog-actions"><button type="button" onClick={() => setShowForm(false)}>取消</button><button className="dialog-primary" disabled={!name.trim()}>创建</button></div></form></div>}
    {showAiCharacter && <div className="dialog-backdrop" onMouseDown={() => setShowAiCharacter(false)}><section className="character-generator-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="memory-heading"><div><span className="card-kicker">AI CHARACTER STUDIO</span><h2>AI 生成人物</h2></div><button onClick={() => setShowAiCharacter(false)}>关闭</button></div><label>生成方式<select value={characterGenerationMode} onChange={(event) => { setCharacterGenerationMode(event.target.value as "specified" | "candidates"); setCharacterCandidates([]); setSelectedCharacters([]); setCharacterError(""); }}><option value="specified">根据描写生成指定人物</option><option value="candidates">依据总纲生成 3 个候选</option></select></label><p className="form-hint">{characterGenerationMode === "specified" ? "粘贴一名人物的完整描写，AI 只会提炼这个人物，并保持姓名、经历、能力和人物弧等既定事实。" : "AI 会读取正式总纲和现有人物，生成 3 个功能互补的候选人物。"}</p><label>{characterGenerationMode === "specified" ? "人物描写（必填）" : "人物需求（选填）"}<textarea autoFocus value={characterInstruction} onChange={(event) => setCharacterInstruction(event.target.value)} placeholder={characterGenerationMode === "specified" ? "例如：陈野，十八岁，核心主角……" : "留空则依据总纲自动生成；也可以补充人物身份、剧情功能或关系要求"}/></label><button className="character-generate-button" onClick={generateCharacters} disabled={characterGenerating}><Sparkles size={14}/>{characterGenerating ? "正在生成人物…" : characterGenerationMode === "specified" ? "提炼指定人物" : "生成 3 个候选人物"}</button>{characterError && <p className="generator-error">{characterError}</p>}<div className="character-candidates">{characterCandidates.map((candidate) => <article key={candidate.name} className={selectedCharacters.includes(candidate.name) ? "selected" : ""}><label className="candidate-check"><input type="checkbox" checked={selectedCharacters.includes(candidate.name)} onChange={() => toggleCharacter(candidate.name)}/><span/></label><div><span className="entry-type">{characterGenerationMode === "specified" ? "指定人物" : "人物候选"}</span><h3>{candidate.name}</h3><p><b>核心欲望：</b>{candidate.coreDesire || "待补充"}</p><p><b>外部目标：</b>{candidate.externalGoal || "待补充"}</p>{candidate.internalNeed && <p><b>内在需求：</b>{candidate.internalNeed}</p>}</div></article>)}</div>{characterCandidates.length > 0 && <div className="candidate-actions">{characterGenerationMode === "candidates" && <button onClick={() => setSelectedCharacters(selectedCharacters.length === characterCandidates.length ? [] : characterCandidates.map((item) => item.name))}>{selectedCharacters.length === characterCandidates.length ? "取消全选" : "全选"}</button>}<button className="dialog-primary" onClick={acceptSelectedCharacters} disabled={!selectedCharacters.length}>{characterGenerationMode === "specified" ? "加入人物卡" : `将选中的 ${selectedCharacters.length} 人加入人物卡`}</button></div>}</section></div>}
    {editingCharacter && characterDraft && <div className="dialog-backdrop" onMouseDown={() => setEditingCharacter(null)}><section className="character-detail-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="memory-heading"><div><span className="card-kicker">CHARACTER DOSSIER</span><h2>{characterDraft.name}</h2></div><button onClick={() => setEditingCharacter(null)}>关闭</button></div><div className="character-ai-refine"><input value={refineInstruction} onChange={(event) => setRefineInstruction(event.target.value)} placeholder="选填：希望 AI 重点完善的方向"/><button onClick={refineCharacter} disabled={refining}><Sparkles size={13}/>{refining ? "完善中…" : "AI 完善档案"}</button></div>{detailError && <p className="generator-error">{detailError}</p>}<div className="character-detail-grid"><label>姓名<input value={characterDraft.name} onChange={(event) => setCharacterDraft({ ...characterDraft, name: event.target.value })}/></label><label>别名（逗号分隔）<input value={characterDraft.aliases.join("，")} onChange={(event) => setCharacterDraft({ ...characterDraft, aliases: event.target.value.split(/[，,]/).map((item) => item.trim()).filter(Boolean) })}/></label>{(["gender","age","role","status","occupation","faction","archetype"] as const).map((field) => <label key={field}>{({ gender:"性别", age:"年龄", role:"故事角色", status:"当前状态", occupation:"身份/职业", faction:"所属阵营", archetype:"人物原型" })[field]}<input value={String(characterDraft.profile[field] ?? "")} onChange={(event) => setCharacterDraft({ ...characterDraft, profile: { ...characterDraft.profile, [field]: event.target.value } })}/></label>)}</div><div className="character-detail-texts">{([['personality','性格'],['appearance','外貌'],['background','人物背景'],['flaw','致命缺陷'],['fear','核心恐惧'],['secret','隐藏秘密'],['arcStart','人物弧起点'],['arcTarget','人物弧终点'],['speechStyle','说话风格']] as const).map(([field,label]) => <label key={field}>{label}<textarea value={String(characterDraft.profile[field] ?? "")} onChange={(event) => setCharacterDraft({ ...characterDraft, profile: { ...characterDraft.profile, [field]: event.target.value } })}/></label>)}<label>核心欲望<textarea value={characterDraft.coreDesire} onChange={(event) => setCharacterDraft({ ...characterDraft, coreDesire: event.target.value })}/></label><label>外部目标<textarea value={characterDraft.externalGoal} onChange={(event) => setCharacterDraft({ ...characterDraft, externalGoal: event.target.value })}/></label><label>内在需求<textarea value={characterDraft.internalNeed} onChange={(event) => setCharacterDraft({ ...characterDraft, internalNeed: event.target.value })}/></label><label>行为边界（每行一条）<textarea value={characterDraft.behaviorConstraints.join("\n")} onChange={(event) => setCharacterDraft({ ...characterDraft, behaviorConstraints: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })}/></label></div><div className="dialog-actions"><button onClick={() => setEditingCharacter(null)}>取消</button><button className="dialog-primary" onClick={saveCharacter} disabled={!characterDraft.name.trim()}>保存人物档案</button></div></section></div>}
    {relationshipDraft && <div className="dialog-backdrop" onMouseDown={() => setRelationshipDraft(null)}><section className="relationship-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="memory-heading"><div><span className="card-kicker">CHARACTER RELATIONSHIP</span><h2>{relationshipDraft.id ? "编辑人物关系" : "新增人物关系"}</h2></div><button onClick={() => setRelationshipDraft(null)}>关闭</button></div>{relationshipError && <p className="generator-error">{relationshipError}</p>}<div className="relationship-form-grid"><label>人物 A<select disabled={Boolean(relationshipDraft.id)} value={relationshipDraft.characterAId ?? ""} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, characterAId: event.target.value })}>{characters.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>人物 B<select disabled={Boolean(relationshipDraft.id)} value={relationshipDraft.characterBId ?? ""} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, characterBId: event.target.value })}>{characters.filter((person) => person.id !== relationshipDraft.characterAId).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>关系类型<input value={relationshipDraft.relationType ?? ""} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, relationType: event.target.value })} placeholder="朋友、同事、盟友、敌对……"/></label><label>当前阶段<input value={relationshipDraft.status ?? ""} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, status: event.target.value })} placeholder="接触、合作、紧张、破裂……"/></label></div><label>人物 A 对 B 的态度<textarea value={relationshipDraft.aToBAttitude ?? ""} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, aToBAttitude: event.target.value })}/></label><label>人物 B 对 A 的态度<textarea value={relationshipDraft.bToAAttitude ?? ""} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, bToAAttitude: event.target.value })}/></label><label>关系说明<textarea value={relationshipDraft.description ?? ""} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, description: event.target.value })}/></label><label>下一步关系方向<textarea value={relationshipDraft.nextDirection ?? ""} onChange={(event) => setRelationshipDraft({ ...relationshipDraft, nextDirection: event.target.value })}/></label><div className="dialog-actions"><button onClick={() => setRelationshipDraft(null)}>取消</button><button className="dialog-primary" onClick={saveRelationship} disabled={!relationshipDraft.characterAId || !relationshipDraft.characterBId || relationshipDraft.characterAId === relationshipDraft.characterBId}>保存关系</button></div></section></div>}
  </main>;
}
