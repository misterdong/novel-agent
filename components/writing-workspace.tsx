"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Brain, ChevronDown, CircleCheck, Clock3, Feather, Library, Lock, MoreHorizontal, Plus, Save, Search, Settings2, ShieldCheck, Sparkles, Target, Trash2, Users } from "lucide-react";
import { currentProjectId, projectHref, rememberProjectInUrl } from "@/lib/project-navigation";

type ChapterItem = { id?: string; number: number; title: string; words: number; status?: string; done?: boolean; active?: boolean };
type VersionItem = { id: string; versionNo: number; wordCount: number; sourceType: string; createdAt: string };
type SceneItem = { id: string; position: number; title: string; targetWords: number; outline: { objective?: string; conflict?: string; outcome?: string } };
type MemoryProposal = { id: string; proposalType: string; predicate: string; newValue: Record<string, unknown>; evidence: { quote?: string }; status: string };

const proposalTypeLabels: Record<string, string> = { character: "人物状态", relationship: "人物关系", item: "普通物品", location: "地点状态", ability: "能力状态", event: "剧情事件", foreshadowing: "伏笔", timeline: "时间线", knowledge: "人物认知", story_item: "剧情道具" };

function proposalTitle(proposal: MemoryProposal) {
  if (proposal.proposalType === "knowledge") return `${String(proposal.newValue.characterName ?? "未知人物")}：${String(proposal.newValue.proposition ?? proposal.predicate)}`;
  return String(proposal.newValue.title ?? proposal.newValue.description ?? proposal.predicate).slice(0, 100);
}
type ReviewIssue = { id: string; severity: string; status: string; code: string; title: string; explanation: string; evidence: Array<Record<string, unknown>>; suggestions: Array<{ action?: string; description?: string; replacement?: string }> };
type FixPreview = { issue: ReviewIssue; replacement?: string; nextText?: string; before?: string; after?: string; label?: string };
type ProjectItem = { id: string; title: string; genre: string };
type ContextCharacter = { id: string; name: string; coreDesire: string; externalGoal: string };
type HardRule = { id: string; name: string; summary: string };
type CharacterCandidate = { name: string; gender?: string; age?: string | number; role?: string; personality?: string; appearance?: string; background?: string; coreDesire: string; externalGoal: string };

const fallbackChapters: ChapterItem[] = [
  { number: 1, title: "看不见的数字", words: 3248, done: true },
  { number: 2, title: "零号病房", words: 2916, done: true },
  { number: 3, title: "倒计时之外", words: 1240, active: true },
  { number: 4, title: "死者的预约", words: 0 },
  { number: 5, title: "白色谎言", words: 0 },
];

const initialText = `凌晨两点十七分，急诊走廊尽头的灯闪了一下。\n\n林默抬起头。候诊区里只剩下三个人：抱着孩子的年轻母亲，捂住腹部的醉汉，以及坐在最远处、穿灰色风衣的老人。\n\n每个人头顶都悬着一串淡红色数字。\n\n六十一年，三个月。\n\n七小时，二十二分。\n\n老人头顶什么都没有。\n\n林默握住病历夹的手停在半空。这是他第二次见到这种情况。第一次，是在三年前的手术室里——镜子中的自己，同样没有数字。\n\n“林医生？”护士压低声音，“三号床等您。”\n\n他收回视线。老人却在这时抬起头，隔着半条走廊准确地看向他。\n\n“你终于来了。”老人说。`;

export function WritingWorkspace() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [volumeId, setVolumeId] = useState<string | null>(null);
  const [text, setText] = useState(initialText);
  const [projectTitle, setProjectTitle] = useState("寿命盲区");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [volumeTitle, setVolumeTitle] = useState("第一卷 · 无字之人");
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [chapterTitle, setChapterTitle] = useState("倒计时之外");
  const [chapterNumber, setChapterNumber] = useState(3);
  const [chapterStatus, setChapterStatus] = useState("writing");
  const [chapters, setChapters] = useState<ChapterItem[]>(fallbackChapters);
  const [saveState, setSaveState] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const hydrated = useRef(false);
  const lastSavedText = useRef(initialText);
  const pendingSaveSource = useRef<"autosave" | "ai" | "rewrite">("autosave");
  const [preview, setPreview] = useState("");
  const [generatedCharacters, setGeneratedCharacters] = useState<CharacterCandidate[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generationRunId, setGenerationRunId] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"project" | "volume" | "chapter">("chapter");
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogGenre, setDialogGenre] = useState("悬疑");
  const [dialogError, setDialogError] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<VersionItem[]>([]);
  const [scenes, setScenes] = useState<SceneItem[]>([]);
  const [chapterOutline, setChapterOutline] = useState<Record<string, unknown>>({});
  const [contextCharacters, setContextCharacters] = useState<ContextCharacter[]>([]);
  const [hardRules, setHardRules] = useState<HardRule[]>([]);
  const [narrativePov, setNarrativePov] = useState("第三人称限知");
  const [showMemory, setShowMemory] = useState(false);
  const [chapterSummary, setChapterSummary] = useState<{ shortSummary: string; detailedSummary: string; openQuestions: string[] } | null>(null);
  const [memoryProposals, setMemoryProposals] = useState<MemoryProposal[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const [showReviews, setShowReviews] = useState(false);
  const [reviewIssues, setReviewIssues] = useState<ReviewIssue[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewHasRun, setReviewHasRun] = useState(false);
  const [reviewProvider, setReviewProvider] = useState("");
  const [fixPreview, setFixPreview] = useState<FixPreview | null>(null);
  const [contextTab, setContextTab] = useState<"plan" | "context" | "reviews" | "ai">("plan");
  const [aiConfig, setAiConfig] = useState<{ provider: string; model: string; configured: boolean; usingMock: boolean } | null>(null);
  const [connectionTest, setConnectionTest] = useState<{ state: "idle" | "testing" | "ok" | "error"; message: string }>({ state: "idle", message: "" });
  const words = useMemo(() => text.replace(/\s/g, "").length, [text]);
  const planItems = useMemo(() => [
    { label: "核心冲突", value: String(chapterOutline.conflict ?? "") },
    { label: "章节结果", value: String(chapterOutline.outcome ?? "") },
    { label: "结尾钩子", value: String(chapterOutline.endingHook ?? "") },
  ].filter((item) => item.value.trim()), [chapterOutline]);

  async function loadWorkspace(options?: { chapterId?: string; projectId?: string }) {
    hydrated.current = false;
    const params = new URLSearchParams();
    if (options?.chapterId) params.set("chapterId", options.chapterId);
    if (options?.projectId) params.set("projectId", options.projectId);
    return fetch(`/api/workspace${params.size ? `?${params}` : ""}`)
      .then((response) => {
        if (!response.ok) throw new Error("workspace unavailable");
        return response.json();
      })
      .then((data) => {
        setProjectId(data.project.id);
        setVolumeId(data.volume?.id ?? null);
        setProjectTitle(data.project.title);
        setNarrativePov(data.project.narrativePov ?? "第三人称限知");
        setVolumeTitle(data.volume?.title ?? "尚未创建分卷");
        if (!data.activeChapter) {
          // 项目没有章节时也要完成页面初始化，用户可以直接点击“新建章节”。
          setChapters([]); setChapterId(null); setChapterTitle("尚未创建章节"); setChapterNumber(0);
          setChapterStatus("draft"); setText(""); setScenes([]); setChapterOutline({});
          setContextCharacters(data.characters ?? []); setHardRules(data.hardRules ?? []);
          lastSavedText.current = ""; hydrated.current = true; setSaveState("saved");
          return;
        }
        setChapters(data.chapters.map((chapter: { id: string; number: number; title: string; words: number; status: string }) => ({
          ...chapter,
          done: chapter.status === "completed",
          active: chapter.id === data.activeChapter.id,
        })));
        setChapterId(data.activeChapter.id);
        setChapterTitle(data.activeChapter.title);
        setChapterNumber(data.activeChapter.number);
        setChapterStatus(data.activeChapter.status);
        setChapterOutline(data.activeChapter.outline ?? {});
        setScenes(data.scenes ?? []);
        setContextCharacters(data.characters ?? []);
        setHardRules(data.hardRules ?? []);
        setReviewIssues([]);
        setReviewHasRun(false);
        setReviewError("");
        setReviewProvider("");
        lastSavedText.current = data.activeChapter.content;
        setText(data.activeChapter.content);
        setSaveState("saved");
        window.setTimeout(() => { hydrated.current = true; }, 0);
      })
      .catch(() => setSaveState("error"));
  }

  useEffect(() => {
    loadWorkspace({ projectId: currentProjectId() || undefined });
    loadProjects();
    fetch("/api/ai/config").then((response) => response.json()).then(setAiConfig).catch(() => undefined);
  }, []);

  async function loadProjects() {
    const response = await fetch("/api/projects");
    if (!response.ok) return;
    const data = await response.json();
    setProjects(data.projects ?? []);
  }

  useEffect(() => {
    // Loading a manuscript changes `text`; the hydration flag prevents that change
    // from being mistaken for a user edit and saved as a duplicate version.
    if (!hydrated.current || !chapterId || text === lastSavedText.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterId, content: text, sourceType: pendingSaveSource.current }),
        });
        if (!response.ok) throw new Error("save failed");
        // Advance the baseline only after the server confirms the immutable version.
        lastSavedText.current = text;
        pendingSaveSource.current = "autosave";
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [chapterId, text]);

  async function generate() {
    if (!chapterId) return;
    setGenerating(true);
    setPreview("");
    try {
      const response = await fetch("/api/generations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chapterId, sceneId: scenes[0]?.id, instruction: aiInstruction }) });
      if (!response.ok) throw new Error("generation failed");
      const queued = await response.json();
      setGenerationRunId(queued.id);
      // Polling keeps the UI independent from the worker process. This can later be
      // replaced by SSE without changing the task API or database lifecycle.
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const statusResponse = await fetch(`/api/generations?id=${queued.id}`);
        const run = await statusResponse.json();
        if (run.status === "completed") { setPreview(run.parsedOutput.prose); setGeneratedCharacters(run.parsedOutput.characterCandidates ?? []); return; }
        if (run.status === "failed" || run.status === "cancelled") return;
      }
    } finally { setGenerating(false); setGenerationRunId(null); }
  }

  async function testAiConnection() {
    setConnectionTest({ state: "testing", message: "正在连接模型…" });
    const response = await fetch("/api/ai/config", { method: "POST" });
    const result = await response.json();
    setConnectionTest(response.ok
      ? { state: "ok", message: `连接成功 · ${result.model}` }
      : { state: "error", message: result.error ?? "连接失败" });
  }

  async function cancelGeneration() {
    if (!generationRunId) return;
    await fetch("/api/generations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: generationRunId, action: "cancel" }) });
  }

  function acceptPreview() {
    pendingSaveSource.current = "ai";
    setText((value) => `${value}\n\n${preview}`);
    setPreview("");
  }

  async function acceptGeneratedCharacter(candidate: CharacterCandidate) {
    if (!projectId) return;
    const response = await fetch("/api/story-bible", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "character", projectId, name: candidate.name, coreDesire: candidate.coreDesire ?? "", externalGoal: candidate.externalGoal ?? "", profile: { gender: candidate.gender ?? "", age: candidate.age ?? "", role: candidate.role ?? "", personality: candidate.personality ?? "", appearance: candidate.appearance ?? "", background: candidate.background ?? "" } }) });
    if (!response.ok) return;
    setGeneratedCharacters((items) => items.filter((item) => item !== candidate));
    setContextCharacters((items) => [...items, { id: `accepted-${candidate.name}`, ...candidate }]);
  }

  async function switchChapter(nextChapterId?: string) {
    if (!nextChapterId || nextChapterId === chapterId || saveState === "saving") return;
    setPreview("");
    setSaveState("loading");
    await loadWorkspace({ chapterId: nextChapterId, projectId: projectId ?? undefined });
  }

  function openDialog(mode: "project" | "volume" | "chapter") {
    setDialogMode(mode);
    setDialogTitle("");
    setDialogError("");
    setShowDialog(true);
  }

  async function submitDialog(event: React.FormEvent) {
    event.preventDefault();
    setDialogError("");
    const response = await fetch(dialogMode === "project" ? "/api/projects" : "/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dialogMode === "project"
        ? { title: dialogTitle, genre: dialogGenre }
        : dialogMode === "volume"
          ? { kind: "volume", title: dialogTitle, projectId }
          : { kind: "chapter", title: dialogTitle, volumeId }),
    });
    if (!response.ok) {
      setDialogError("创建失败，请检查名称后重试。");
      return;
    }
    const data = await response.json();
    setShowDialog(false);
    setSaveState("loading");
    if (dialogMode === "project") {
      await loadProjects();
      rememberProjectInUrl(data.project.id);
      await loadWorkspace({ projectId: data.project.id, chapterId: data.chapter.id });
    } else if (dialogMode === "volume") {
      await loadWorkspace({ projectId: projectId ?? undefined });
    } else {
      await loadWorkspace({ projectId: projectId ?? undefined, chapterId: data.id });
    }
  }

  async function updateChapter(changes: { title?: string; status?: string }) {
    if (!chapterId) return;
    const response = await fetch(`/api/chapters/${chapterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    if (!response.ok) return setSaveState("error");
    const updated = await response.json();
    setChapterTitle(updated.title);
    setChapterStatus(updated.status);
    setChapters((items) => items.map((item) => item.id === chapterId
      ? { ...item, title: updated.title, status: updated.status, done: updated.status === "completed" }
      : item));
  }

  async function deleteChapter() {
    if (!chapterId || chapters.length <= 1) return;
    if (!window.confirm(`确定删除第 ${chapterNumber} 章“${chapterTitle}”吗？\n\n正文版本、场景、摘要和检查记录也会一并删除，此操作不可撤销。`)) return;
    setSaveState("loading");
    const response = await fetch(`/api/chapters/${chapterId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) { window.alert(data.message ?? "删除章节失败。"); setSaveState("error"); return; }
    await loadWorkspace({ projectId: projectId ?? undefined, chapterId: data.nextChapterId ?? undefined });
  }

  async function openVersions() {
    if (!chapterId) return;
    const response = await fetch(`/api/chapters/${chapterId}/versions`);
    if (!response.ok) return;
    const data = await response.json();
    setVersions(data.versions);
    setShowVersions(true);
  }

  async function restoreVersion(versionId: string) {
    if (!chapterId) return;
    setSaveState("loading");
    const response = await fetch(`/api/chapters/${chapterId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ versionId }),
    });
    if (!response.ok) return setSaveState("error");
    setShowVersions(false);
    await loadWorkspace({ projectId: projectId ?? undefined, chapterId });
  }

  async function openMemory(generate = false) {
    if (!chapterId) return;
    if (generate) { setShowMemory(true); setMemoryLoading(true); setMemoryError(""); }
    const response = await fetch(`/api/chapters/${chapterId}/memory`, { method: generate ? "POST" : "GET" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); setMemoryError(body.message ?? "章节记忆提取失败，请检查大模型配置后重试。"); setMemoryLoading(false); return; }
    const data = await response.json();
    setChapterSummary(data.summary);
    setMemoryProposals(data.proposals ?? []);
    setMemoryLoading(false);
    setShowMemory(true);
  }

  async function reviewProposal(proposalId: string, decision: "accepted" | "rejected") {
    if (!chapterId) return;
    await fetch(`/api/chapters/${chapterId}/memory`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposalId, decision }) });
    await openMemory(false);
  }

  async function openReviews(run = false) {
    if (!chapterId) return;
    // Open first so model latency is visible instead of making the click appear lost.
    if (run) setShowReviews(true);
    await loadReviewIssues(run);
    setShowReviews(true);
  }

  async function loadReviewIssues(run = false) {
    if (!chapterId) return;
    setReviewLoading(true);
    setReviewError("");
    if (run) {
      setReviewHasRun(false);
      setReviewProvider("");
    }
    try {
      const response = await fetch(`/api/chapters/${chapterId}/reviews`, { method: run ? "POST" : "GET" });
      const data = await response.json();
      if (!response.ok) {
        setReviewError(data.message ?? "一致性检查失败，请检查模型配置。");
        return;
      }
      setReviewIssues(data.issues ?? []);
      if (run) {
        setReviewHasRun(true);
        setReviewProvider([data.provider, data.model].filter(Boolean).join(" · "));
      }
    } finally {
      setReviewLoading(false);
    }
  }

  function selectContextTab(tab: "plan" | "context" | "reviews" | "ai") {
    setContextTab(tab);
    // Reading the check tab is non-destructive: it loads persisted issues but does
    // not run a new model/database review until the user explicitly asks for one.
    if (tab === "reviews") void loadReviewIssues(false);
  }

  async function updateIssue(issueId: string, action: "fixed" | "ignored" | "false_positive") {
    if (!chapterId) return;
    await fetch(`/api/chapters/${chapterId}/reviews`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issueId, action }) });
    await openReviews(false);
  }

  function openFixPreview(issue: ReviewIssue) {
    const suggestion = issue.suggestions.find((item) => item.replacement?.trim());
    if (!suggestion?.replacement) return;
    const raw = suggestion.replacement.trim();
    const instruction = raw.match(/^在[“"](.+?)[”"](前|后)插入[：:]\s*([\s\S]+)$/);
    let nextText = text;
    let label = "应用局部修复";

    if (instruction) {
      const [, anchor, direction, prose] = instruction;
      const index = text.indexOf(anchor);
      if (index < 0) { window.alert(`无法在当前正文中定位：“${anchor}”。请重新运行检查。`); return; }
      const position = direction === "前" ? index : index + anchor.length;
      nextText = `${text.slice(0, position)}${direction === "前" ? `${prose}\n\n` : `\n\n${prose}`}${text.slice(position)}`;
      label = `在指定句${direction}插入`;
    } else if (suggestion.action === "append") {
      nextText = `${text.trimEnd()}\n\n${raw}`;
      label = "追加到正文结尾";
    } else {
      // rewrite 必须依赖正文证据精确定位，不能定位时绝不退化为末尾追加。
      const quote = issue.evidence.map((item) => typeof item.quote === "string" ? item.quote.trim() : "").find((item) => item && text.includes(item));
      if (!quote) { window.alert("该修复缺少可定位的正文证据，不能安全应用。请重新运行检查或手动修改。"); return; }
      nextText = text.replace(quote, raw);
      label = "替换问题片段";
    }
    const changedAt = Math.max(0, [...text].findIndex((char, index) => char !== nextText[index]));
    const start = Math.max(0, changedAt - 80);
    setFixPreview({ issue, nextText, before: text.slice(start, start + 220), after: nextText.slice(start, start + 300), label });
  }

  async function applyFix() {
    if (!fixPreview) return;
    let nextText = fixPreview.nextText;
    if (!nextText && fixPreview.replacement) {
      const raw = fixPreview.replacement.trim();
      const instruction = raw.match(/^在[“"](.+?)[”"](前|后)插入[：:]\s*([\s\S]+)$/);
      if (instruction) {
        const [, anchor, direction, prose] = instruction;
        const index = text.indexOf(anchor);
        if (index < 0) { window.alert(`无法在当前正文中定位：“${anchor}”。修复未应用。`); return; }
        const position = direction === "前" ? index : index + anchor.length;
        nextText = `${text.slice(0, position)}${direction === "前" ? `${prose}\n\n` : `\n\n${prose}`}${text.slice(position)}`;
      } else if (fixPreview.issue.suggestions[0]?.action === "append") {
        nextText = `${text.trimEnd()}\n\n${raw}`;
      } else {
        const quote = fixPreview.issue.evidence.map((item) => typeof item.quote === "string" ? item.quote.trim() : "").find((item) => item && text.includes(item));
        if (!quote) { window.alert("该修复缺少可定位的正文证据，修复未应用。"); return; }
        nextText = text.replace(quote, raw);
      }
    }
    if (!nextText || nextText === text) return;
    // 预览已经完成定位与文本变换；确认时直接采用预览结果，确保所见即所得。
    pendingSaveSource.current = "rewrite";
    setText(nextText);
    await updateIssue(fixPreview.issue.id, "fixed");
    setFixPreview(null);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Feather size={18} /></span><span>墨境</span></div>
        <div className="project-switcher-wrap"><button className={`project-switcher ${showProjectMenu ? "open" : ""}`} onClick={() => setShowProjectMenu((value) => !value)} aria-expanded={showProjectMenu}>{projectTitle} <ChevronDown size={15} /></button>{showProjectMenu && <><button className="project-menu-backdrop" aria-label="关闭作品列表" onClick={() => setShowProjectMenu(false)}/><div className="project-menu"><span className="card-kicker">切换作品</span>{projects.map((project) => <button key={project.id} className={project.id === projectId ? "active" : ""} onClick={async () => { setShowProjectMenu(false); if (project.id !== projectId) { setSaveState("loading"); rememberProjectInUrl(project.id); await loadWorkspace({ projectId: project.id }); } }}><b>{project.title}</b><small>{project.genre}</small>{project.id === projectId && <CircleCheck size={14}/>}</button>)}<button className="create-project-entry" onClick={() => { setShowProjectMenu(false); openDialog("project"); }}><Plus size={14}/> 新建作品</button></div></>}</div>
        <div className="topbar-meta"><span className={`saved ${saveState === "error" ? "save-error" : ""}`}><CircleCheck size={14} /> {saveState === "loading" ? "读取中" : saveState === "saving" ? "保存中" : saveState === "error" ? "保存失败" : "已保存"}</span><span>{words.toLocaleString()} 字</span></div>
        <div className="topbar-actions"><button aria-label="搜索"><Search size={18} /></button><Link href={projectHref("/settings/prompts", projectId)} aria-label="提示词设置"><Settings2 size={18} /></Link><div className="avatar">林</div></div>
      </header>

      <aside className="sidebar">
        <nav className="product-nav">
          <span className="nav-link active"><BookOpen size={17} /> 创作</span>
          <Link className="nav-link" href={projectHref("/outline", projectId)}><Target size={17} /> 大纲</Link>
          <Link className="nav-link" href={projectHref("/bible", projectId)}><Library size={17} /> 故事圣经</Link>
          <Link className="nav-link" href={projectHref("/story", projectId)}><Users size={17} /> 故事管理</Link>
          <Link className="nav-link" href={projectHref("/generate", projectId)}><Sparkles size={17} /> AI 生成</Link>
          <Link className="nav-link" href={projectHref("/autopilot", projectId)}><Sparkles size={17} /> 自动创作</Link>
        </nav>
        <div className="sidebar-heading"><span>{volumeTitle}</span><MoreHorizontal size={16} /></div>
        <div className="chapter-list">
          {chapters.map((chapter) => (
            <button className={`chapter ${chapter.active ? "active" : ""}`} key={chapter.id ?? chapter.number} onClick={() => switchChapter(chapter.id)} disabled={saveState === "saving"}>
              <span className="chapter-number">{chapter.done ? <CircleCheck size={14} /> : chapter.number}</span>
              <span className="chapter-info"><strong>{chapter.title}</strong><small>{chapter.words ? `${chapter.words.toLocaleString()} 字` : "尚未开始"}</small></span>
            </button>
          ))}
        </div>
        <button className="new-chapter" onClick={() => openDialog(volumeId ? "chapter" : "volume")}><Plus size={15} /> {volumeId ? "新建章节" : "新建分卷"}</button>
        <div className="sidebar-progress"><div><span>本卷进度</span><b>2 / 24 章</b></div><div className="progress-track"><i /></div></div>
      </aside>

      <section className="editor-column">
        <div className="chapter-toolbar">
          <div><span className="eyebrow">第{chapterNumber}章</span><input className="chapter-title-input" value={chapterTitle} onChange={(event) => setChapterTitle(event.target.value)} onBlur={() => updateChapter({ title: chapterTitle })} aria-label="章节标题" /></div>
          <div className="chapter-actions"><button onClick={() => updateChapter({ status: chapterStatus === "completed" ? "writing" : "completed" })}><CircleCheck size={14} /> {chapterStatus === "completed" ? "继续写作" : "标记完成"}</button><button onClick={() => openReviews(false)}><ShieldCheck size={14}/> 检查</button><button onClick={() => openMemory(false)}><Brain size={14}/> 记忆</button><button onClick={openVersions}><Clock3 size={14} /> 版本</button><button className="danger" onClick={deleteChapter} disabled={chapters.length <= 1 || saveState === "saving"} title={chapters.length <= 1 ? "每个分卷至少保留一章" : "删除当前章节"}><Trash2 size={14}/> 删除</button><button disabled><Save size={14} /> 自动保存</button></div>
        </div>
        <div className="scene-chip"><span>场景 {scenes[0]?.position ?? 1}</span><b>{scenes[0]?.title ?? "尚未规划场景"}</b><small>目标：{scenes[0]?.outline.objective ?? "请先在大纲页面添加场景卡"}</small></div>
        <textarea className="manuscript" value={text} onChange={(event) => setText(event.target.value)} aria-label="章节正文" spellCheck={false} />
        {preview && <div className="generation-preview"><div className="preview-label"><Sparkles size={14} /> AI 候选续写</div><p>{preview}</p>{generatedCharacters.length > 0 && <div className="inline-character-candidates"><b>正文引入了新人物候选</b>{generatedCharacters.map((candidate) => <span key={candidate.name}><span><strong>{candidate.name}</strong><small>{candidate.externalGoal || candidate.coreDesire}</small></span><button onClick={() => acceptGeneratedCharacter(candidate)}>加入故事圣经</button></span>)}</div>}<div><button onClick={acceptPreview} className="primary-small">接受并插入</button><button onClick={() => { setPreview(""); setGeneratedCharacters([]); }}>拒绝</button><button onClick={generate}>重新生成</button></div></div>}
        <footer className="editor-footer"><span>当前场景 {words} / {scenes[0]?.targetWords ?? 1800} 字</span><span>{narrativePov}</span></footer>
      </section>

      <aside className="context-panel">
        <div className="panel-tabs" role="tablist" aria-label="写作辅助面板"><button className={contextTab === "plan" ? "active" : ""} onClick={() => selectContextTab("plan")}>规划</button><button className={contextTab === "context" ? "active" : ""} onClick={() => selectContextTab("context")}>上下文</button><button className={contextTab === "reviews" ? "active" : ""} onClick={() => selectContextTab("reviews")}>检查 <i>{reviewIssues.filter((issue) => issue.status === "open").length}</i></button><button className={contextTab === "ai" ? "active" : ""} onClick={() => selectContextTab("ai")}>AI</button></div>
        {contextTab === "plan" && <><section className="context-card emphasis"><span className="card-kicker">本章目标</span><h2>{String(chapterOutline.objective ?? "尚未设置本章目标")}</h2><p>{String(chapterOutline.conflict ?? "请在大纲页面补充核心冲突。")}</p>{hardRules[0] && <div className="constraint"><Lock size={13} /> {hardRules[0].name}</div>}</section><section className="context-card"><div className="card-title"><span>章节结构</span><small>{planItems.length} 项</small></div>{planItems.length ? <ol className="beats">{planItems.map((item) => <li key={item.label}><b>{item.label}</b><span>{item.value}</span></li>)}</ol> : <p className="empty-copy">尚未填写冲突、结果和结尾钩子。</p>}<Link className="context-link" href={projectHref("/outline", projectId)}>编辑章节卡</Link></section></>}
        {contextTab === "context" && <><section className="context-card"><div className="card-title"><span>项目人物</span><Link href={projectHref("/bible", projectId)}>管理</Link></div>{contextCharacters.map((person, index) => <div className="character-row" key={person.id}><div className={`portrait ${index === 0 ? "warm" : ""}`}>{person.name.trim().charAt(0) || "?"}</div><div><b>{person.name}</b><small>{person.externalGoal || person.coreDesire || "尚未填写人物目标"}</small></div></div>)}{!contextCharacters.length && <p className="empty-copy">故事圣经中还没有人物卡。</p>}</section><section className="context-card"><div className="card-title"><span>当前场景</span><small>{scenes.length} 个场景</small></div><h2>{scenes[0]?.title ?? "尚未规划场景"}</h2><p>{scenes[0]?.outline.objective ?? "请在大纲页面补充场景目标。"}</p>{scenes[0]?.outline.conflict && <p className="context-detail"><b>冲突</b>{scenes[0].outline.conflict}</p>}<Link className="context-link" href={projectHref("/outline", projectId)}>编辑章节与场景卡</Link></section><section className="context-card"><div className="card-title"><span>硬性规则</span><small>{hardRules.length} 条</small></div>{hardRules.slice(0, 4).map((rule) => <div className="rule-row" key={rule.id}><Lock size={12}/><div><b>{rule.name}</b>{rule.summary && <small>{rule.summary}</small>}</div></div>)}{!hardRules.length && <p className="empty-copy">故事圣经中还没有硬性规则。</p>}</section></>}
        {contextTab === "reviews" && <section className="context-card"><div className="card-title"><span>质量检查</span><small>{reviewLoading ? "AI 检查中…" : `${reviewIssues.filter((issue) => issue.status === "open").length} 个待处理`}</small></div><p>使用规则引擎与 AI Provider 检查正文、章节规划、人物、时间线和硬性设定。</p>{reviewError && <p className="review-error">{reviewError}</p>}{reviewHasRun && !reviewIssues.length && !reviewError && <p className="review-success">检查完成，没有发现明确问题。</p>}<div className="compact-reviews">{reviewIssues.filter((issue) => issue.status === "open").slice(0, 3).map((issue) => <button key={issue.id} onClick={() => setShowReviews(true)}><span className={`severity ${issue.severity}`}>{issue.severity}</span><b>{issue.title}</b></button>)}</div><button className="context-primary" onClick={() => openReviews(reviewIssues.length === 0)} disabled={reviewLoading}>{reviewLoading ? "正在调用模型…" : reviewIssues.length === 0 ? "运行 AI 检查" : "查看全部结果"}</button></section>}
        {contextTab === "ai" && <section className="ai-box"><div><span className="spark"><Sparkles size={16} /></span><div><b>写作助手</b><small>将读取章节卡、场景卡、人物和硬性规则</small></div></div><div className="provider-status"><span>{aiConfig?.usingMock ? "离线模式" : aiConfig?.provider ?? "读取配置"}</span><b>{aiConfig?.model ?? "…"}</b><button onClick={testAiConnection} disabled={connectionTest.state === "testing" || aiConfig?.usingMock}>{connectionTest.state === "testing" ? "测试中" : "测试连接"}</button></div>{connectionTest.message && <p className={`connection-result ${connectionTest.state}`}>{connectionTest.message}</p>}<textarea value={aiInstruction} onChange={(event) => setAiInstruction(event.target.value)} placeholder="补充本次写作要求……" /><button className="generate-button" onClick={generating ? cancelGeneration : generate} disabled={!aiConfig?.configured}><Sparkles size={16} /> {generating ? "取消生成" : "续写当前场景"}</button><p>{generating ? "任务已进入本地 Worker 队列" : `${aiConfig?.model ?? "Mock Provider"} · 异步任务将持久化`}</p></section>}
      </aside>
      {showDialog && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowDialog(false)}>
        <form className="create-dialog" onSubmit={submitDialog} onMouseDown={(event) => event.stopPropagation()}>
          <span className="card-kicker">{dialogMode === "project" ? "新小说" : dialogMode === "volume" ? "新分卷" : "新章节"}</span>
          <h2>{dialogMode === "project" ? "开始一个新的故事" : dialogMode === "volume" ? "为作品创建分卷" : "添加下一章"}</h2>
          <label>名称<input autoFocus value={dialogTitle} onChange={(event) => setDialogTitle(event.target.value)} placeholder={dialogMode === "project" ? "例如：雾港来信" : dialogMode === "volume" ? "例如：第一卷 · 异常初现" : "例如：不在名单上的人"} /></label>
          {dialogMode === "project" && <label>类型<input value={dialogGenre} onChange={(event) => setDialogGenre(event.target.value)} placeholder="悬疑、玄幻、科幻……" /></label>}
          {dialogError && <p className="dialog-error">{dialogError}</p>}
          <div className="dialog-actions"><button type="button" onClick={() => setShowDialog(false)}>取消</button><button className="dialog-primary" type="submit" disabled={!dialogTitle.trim()}>创建</button></div>
        </form>
      </div>}
      {showVersions && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowVersions(false)}>
        <section className="version-dialog" onMouseDown={(event) => event.stopPropagation()}>
          <span className="card-kicker">正文历史</span><h2>第{chapterNumber}章 · {chapterTitle}</h2>
          <div className="version-list">{versions.map((version, index) => <article key={version.id}>
            <div><b>V{version.versionNo}{index === 0 ? " · 当前" : ""}</b><small>{new Date(version.createdAt).toLocaleString("zh-CN")} · {version.wordCount} 字 · {version.sourceType}</small></div>
            {index > 0 && <button onClick={() => restoreVersion(version.id)}>恢复此版本</button>}
          </article>)}</div>
          <div className="dialog-actions"><button onClick={() => setShowVersions(false)}>关闭</button></div>
        </section>
      </div>}
      {showMemory && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowMemory(false)}><section className="memory-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="memory-heading"><div><span className="card-kicker">章节记忆</span><h2>摘要与状态变化</h2></div><button onClick={() => openMemory(true)} disabled={memoryLoading}>{memoryLoading ? "AI 提取中…" : "重新提取"}</button></div>{memoryError && <p className="review-error review-dialog-message">{memoryError}</p>}{memoryLoading ? <div className="summary-box empty"><p>正在通读完整章节并提取摘要、伏笔、时间线与人物认知，请稍候…</p></div> : chapterSummary ? <div className="summary-box"><b>短摘要</b><p>{chapterSummary.shortSummary}</p><b>详细摘要</b><p>{chapterSummary.detailedSummary}</p>{chapterSummary.openQuestions?.map((question) => <small key={question}>未解决：{question}</small>)}</div> : <div className="summary-box empty"><p>尚未提取章节记忆。</p><button onClick={() => openMemory(true)}>开始提取</button></div>}<div className="proposal-list"><h3>记忆更新提案</h3>{memoryProposals.map((proposal) => <article key={proposal.id}><div><b>{proposalTitle(proposal)}</b><p>{proposal.evidence.quote ?? JSON.stringify(proposal.newValue)}</p><small>{proposalTypeLabels[proposal.proposalType] ?? proposal.proposalType} · {proposal.status === "pending" ? "待确认" : proposal.status === "accepted" ? "已接受" : "已拒绝"}</small></div>{proposal.status === "pending" && <div><button onClick={() => reviewProposal(proposal.id, "rejected")}>拒绝</button><button className="accept" onClick={() => reviewProposal(proposal.id, "accepted")}>接受</button></div>}</article>)}{memoryProposals.length === 0 && <p className="empty-copy">没有待审批的记忆变化。</p>}</div><div className="dialog-actions"><button onClick={() => setShowMemory(false)}>关闭</button></div></section></div>}
      {showReviews && <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowReviews(false)}><section className="memory-dialog review-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="memory-heading"><div><span className="card-kicker">质量审校</span><h2>一致性与剧情检查</h2></div><button onClick={() => openReviews(true)} disabled={reviewLoading}>{reviewLoading ? "检查中…" : "运行检查"}</button></div>{reviewError && <p className="review-error review-dialog-message">{reviewError}</p>}{reviewHasRun && reviewProvider && <p className="review-provider">本次检查：{reviewProvider}</p>}<div className="review-list">{reviewIssues.map((issue) => <article key={issue.id} className={issue.status !== "open" ? "resolved" : ""}><span className={`severity ${issue.severity}`}>{issue.severity}</span><div><b>{issue.title}</b><p>{issue.explanation}</p><small>{issue.code} · {issue.status}</small>{issue.suggestions[0]?.replacement && issue.status === "open" && <button className="preview-fix" onClick={() => setFixPreview({ issue, replacement: issue.suggestions[0].replacement! })}>预览修复</button>}</div>{issue.status === "open" && <button onClick={() => updateIssue(issue.id, "ignored")}>忽略</button>}</article>)}{reviewIssues.length === 0 && <div className="summary-box empty"><p>{reviewLoading ? "正在读取正文与故事设定并调用模型，请稍候…" : reviewHasRun && !reviewError ? "检查完成，没有发现明确问题。" : reviewError ? "本次检查未完成。" : "尚未运行检查。"}</p><button onClick={() => openReviews(true)} disabled={reviewLoading}>{reviewLoading ? "模型处理中…" : reviewError ? "重新检查" : reviewHasRun ? "再次检查" : "开始检查"}</button></div>}</div><div className="dialog-actions"><button onClick={() => setShowReviews(false)}>关闭</button></div></section></div>}
      {fixPreview && <div className="dialog-backdrop fix-layer" role="presentation"><section className="fix-dialog"><span className="card-kicker">修复预览</span><h2>{fixPreview.issue.title}</h2><div className="fix-before"><b>当前正文结尾</b><p>{text.slice(-160)}</p></div><div className="fix-after"><b>建议追加</b><p>{fixPreview.replacement}</p></div><div className="dialog-actions"><button onClick={() => setFixPreview(null)}>取消</button><button className="dialog-primary" onClick={applyFix}>应用修复</button></div></section></div>}
    </main>
  );
}
