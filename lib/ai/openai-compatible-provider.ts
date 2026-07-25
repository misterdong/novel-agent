import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AiRuntimeConfig } from "./config";
import type { AiProvider, ChapterMemoryContext, ChapterMemoryResult, ChapterPlanningContext, ReviewContext, ReviewFinding, WritingContext } from "./provider";
import { foreshadowPlannerSystemPrompt } from "./prompts/foreshadow-planner";
import { narrativeCoordinatorSystemPrompt } from "./prompts/narrative-coordinator";
import { structureReviserSystemPrompt } from "./prompts/structure-reviser";
import { structureValidatorSystemPrompt } from "./prompts/structure-validator";
import { storylineGeneratorSystemPrompt } from "./prompts/storyline-generator";
import { volumePlanSystemPrompt } from "./prompts/volume-plan";
import { rollingStructurePlannerSystemPrompt } from "./prompts/rolling-structure-planner";

type ChatResponse = { choices?: Array<{ message?: { content?: string }; finish_reason?: string }>; error?: { message?: string }; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
type ChatMessage = { role: "system" | "user"; content: string };

async function logAiPrompt(config: AiRuntimeConfig, taskType: string, messages: ChatMessage[]) {
  // 提示词日志不会记录请求头、密钥和模型响应。默认使用便于开发者阅读的文本格式，
  // 同时保留 JSONL 格式供自动化程序处理。
  const configuredPath = process.env.AI_PROMPT_LOG_FILE?.trim() || "logs/ai-prompts.log";
  const logPath = path.isAbsolute(configuredPath) ? configuredPath : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
  await mkdir(path.dirname(logPath), { recursive: true });
  const timestamp = new Date().toISOString();
  const format = process.env.AI_PROMPT_LOG_FORMAT?.trim().toLowerCase();
  if (format === "jsonl") {
    await appendFile(logPath, `${JSON.stringify({ timestamp, taskType, provider: config.provider, model: config.model, messages })}\n`, "utf8");
    return;
  }
  const separator = "=".repeat(96);
  const sections = messages.map((message, index) => {
    const heading = `${index + 1}. ${message.role.toUpperCase()}`;
    return `--- ${heading} ${"-".repeat(Math.max(1, 86 - heading.length))}\n${message.content.trim()}\n`;
  }).join("\n");
  const entry = `${separator}\nAI PROMPT\n时间: ${timestamp}\n任务: ${taskType}\nProvider: ${config.provider}\n模型: ${config.model}\n消息数: ${messages.length}\n${separator}\n\n${sections}\n`;
  await appendFile(logPath, entry, "utf8");
}

async function logAiResponse(config: AiRuntimeConfig, taskType: string, body: ChatResponse, httpStatus: number, durationMs: number) {
  const configuredTasks = (process.env.AI_RESPONSE_LOG_TASKS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  // 默认不记录模型响应；配置基础任务名时，其 .retry 调用也一并记录。
  if (!taskType || !configuredTasks.some((item) => item === "*" || taskType === item || taskType.startsWith(`${item}.`))) return;
  const configuredPath = process.env.AI_RESPONSE_LOG_FILE?.trim() || "logs/ai-responses.log";
  const logPath = path.isAbsolute(configuredPath) ? configuredPath : path.join(/*turbopackIgnore: true*/ process.cwd(), configuredPath);
  await mkdir(path.dirname(logPath), { recursive: true });
  const separator = "=".repeat(96);
  const entry = `${separator}\nAI RESPONSE\n时间: ${new Date().toISOString()}\n任务: ${taskType}\nProvider: ${config.provider}\n模型: ${config.model}\nHTTP: ${httpStatus}\n耗时: ${durationMs}ms\nFinish reason: ${body.choices?.[0]?.finish_reason ?? "未知"}\nUsage: ${JSON.stringify(body.usage ?? {})}\n${separator}\n${body.choices?.[0]?.message?.content ?? JSON.stringify(body.error ?? body, null, 2)}\n\n`;
  await appendFile(logPath, entry, "utf8");
  if (process.env.AI_RESPONSE_LOG_STDOUT === "true") console.log(entry);
}

function promptFor(context: WritingContext) {
  return `${context.defaultPrompt}

${context.customPrompt ? `用户自定义提示词：\n${context.customPrompt}\n` : ""}

章节：${context.chapterTitle}
章节卡：${JSON.stringify(context.chapterOutline)}
场景：${context.sceneTitle ?? "当前场景"}
场景卡：${JSON.stringify(context.sceneOutline ?? {})}
硬性规则：${JSON.stringify(context.hardRules)}
人物：${JSON.stringify(context.characters)}
伏笔状态：${JSON.stringify(context.foreshadowings ?? [])}
最近时间线：${JSON.stringify(context.timeline ?? [])}
人物认知：${JSON.stringify(context.characterKnowledge ?? [])}
人物关系：${JSON.stringify(context.characterRelationships ?? [])}
剧情道具：${JSON.stringify(context.storyItems ?? [])}
用户要求：${context.instruction || "自然推进当前场景"}

${!context.previousText.trim() && context.previousChapterEnding ? `上一章结尾（本章必须直接承接，不得重演已经发生的事件）：\n${context.previousChapterEnding}\n` : ""}

已有正文：
${context.previousText.slice(-12000)}

请返回严格 JSON，不要使用 Markdown 代码块：
{"prose":"续写正文","coveredEvents":["已覆盖的情节点"],"characterCandidates":[{"name":"仅填写正文中新出现且故事圣经尚不存在的人物","gender":"","age":"","role":"","personality":"","appearance":"","background":"","coreDesire":"","externalGoal":"","internalNeed":"","behaviorConstraints":[]}]}

如果没有引入新人物，characterCandidates 必须返回空数组。人物候选不会自动写入正式设定。`;
}

function parseModelJson(content: string) {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as { prose?: unknown; coveredEvents?: unknown; characterCandidates?: unknown };
  if (typeof parsed.prose !== "string" || !parsed.prose.trim()) throw new Error("模型返回内容缺少 prose 字段");
  const characterCandidates = Array.isArray(parsed.characterCandidates) ? parsed.characterCandidates.filter((item) => item && typeof item === "object").map((value) => {
    const item = value as Record<string, unknown>;
    return { name: String(item.name ?? ""), gender: String(item.gender ?? ""), age: typeof item.age === "number" ? item.age : String(item.age ?? ""), role: String(item.role ?? ""), personality: String(item.personality ?? ""), appearance: String(item.appearance ?? ""), background: String(item.background ?? ""), occupation: String(item.occupation ?? ""), faction: String(item.faction ?? ""), archetype: String(item.archetype ?? ""), flaw: String(item.flaw ?? ""), fear: String(item.fear ?? ""), secret: String(item.secret ?? ""), arcStart: String(item.arcStart ?? ""), arcTarget: String(item.arcTarget ?? ""), speechStyle: String(item.speechStyle ?? ""), aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : [], coreDesire: String(item.coreDesire ?? ""), externalGoal: String(item.externalGoal ?? ""), internalNeed: String(item.internalNeed ?? ""), behaviorConstraints: Array.isArray(item.behaviorConstraints) ? item.behaviorConstraints.map(String) : [] };
  }).filter((item) => item.name) : [];
  return { prose: parsed.prose, coveredEvents: Array.isArray(parsed.coveredEvents) ? parsed.coveredEvents.map(String) : [], characterCandidates };
}

function escapeControlCharactersInJsonStrings(input: string) {
  let output = "";
  let insideString = false;
  let escaped = false;
  for (const character of input) {
    if (!insideString) {
      output += character;
      if (character === '"') insideString = true;
      continue;
    }
    if (escaped) {
      output += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      output += character;
      escaped = true;
      continue;
    }
    if (character === '"') {
      output += character;
      insideString = false;
      continue;
    }
    // JSON 字符串不能直接包含 U+0000～U+001F 控制字符。
    // 仅转义字符串内部的字符，字符串外用于格式化 JSON 的换行保持不变。
    const code = character.charCodeAt(0);
    if (code < 0x20) {
      output += character === "\n" ? "\\n" : character === "\r" ? "\\r" : character === "\t" ? "\\t" : `\\u${code.toString(16).padStart(4, "0")}`;
    } else output += character;
  }
  return output;
}

function removeTrailingCommasOutsideJsonStrings(input: string) {
  let output = "";
  let insideString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (insideString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') insideString = false;
      continue;
    }
    if (character === '"') { insideString = true; output += character; continue; }
    if (character === ",") {
      let next = index + 1;
      while (next < input.length && /\s/.test(input[next])) next += 1;
      // 仅删除对象或数组闭合前的逗号，不触碰字符串中的正文标点。
      if (input[next] === "}" || input[next] === "]" || input[next] === ",") continue;
    }
    output += character;
  }
  return output;
}

function parseObject(content: string) {
  // 部分兼容服务即使收到严格要求，仍会用 Markdown 代码块包裹 JSON。
  // 此处只移除最外层代码块；损坏或被截断的 JSON 仍然必须报错。
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(cleaned) as Record<string, unknown>; }
  catch (originalError) {
    // 兼容模型常见的两类近似 JSON：字符串内原始控制字符，以及闭合括号前的尾随逗号。
    // 修复过程按 JSON 字符串边界扫描，避免正则误改正文内容。
    const repaired = removeTrailingCommasOutsideJsonStrings(escapeControlCharactersInJsonStrings(cleaned));
    if (repaired === cleaned) throw originalError;
    try { parsed = JSON.parse(repaired) as Record<string, unknown>; } catch { throw originalError; }
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("模型没有返回 JSON 对象");
  return parsed;
}

function parseReviewFindings(content: string): ReviewFinding[] {
  const parsed = parseObject(content);
  if (!Array.isArray(parsed.issues)) throw new Error("模型返回内容缺少 issues 数组");
  return parsed.issues.slice(0, 20).map((value, index) => {
    const item = value as Record<string, unknown>;
    const reviewType = item.reviewType === "plot" ? "plot" : "continuity";
    const severity = item.severity === "error" || item.severity === "warning" ? item.severity : "suggestion";
    if (!String(item.title ?? "").trim() || !String(item.explanation ?? "").trim()) {
      throw new Error(`模型返回的第 ${index + 1} 个检查项缺少标题或说明`);
    }
    return {
      reviewType,
      severity,
      code: String(item.code ?? `AI_${reviewType.toUpperCase()}_${index + 1}`).slice(0, 80),
      title: String(item.title).slice(0, 200),
      explanation: String(item.explanation),
      evidence: Array.isArray(item.evidence) ? item.evidence.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>> : [],
      suggestions: Array.isArray(item.suggestions) ? item.suggestions.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>> : [],
    };
  });
}

function reviewPrompt(context: ReviewContext) {
  return `${context.defaultPrompt}\n\n${context.customPrompt ? `用户自定义要求：\n${context.customPrompt}\n\n` : ""}章节：${context.chapterTitle}
章节卡：${JSON.stringify(context.chapterOutline)}
硬性规则：${JSON.stringify(context.hardRules)}
人物设定：${JSON.stringify(context.characters)}
时间线：${JSON.stringify(context.timeline)}
人物认知：${JSON.stringify(context.characterKnowledge)}
伏笔状态：${JSON.stringify(context.foreshadowings ?? [])}
人物关系：${JSON.stringify(context.characterRelationships ?? [])}
剧情道具：${JSON.stringify(context.storyItems ?? [])}
${context.previousChapterEnding ? `上一章结尾：\n${context.previousChapterEnding}\n` : ""}

正文：
${context.manuscript.slice(-30000)}

只报告有明确证据的问题，不要把未提及的设定视为冲突。返回严格 JSON：
{"issues":[{"reviewType":"continuity或plot","severity":"error或warning或suggestion","code":"稳定英文代码","title":"简短标题","explanation":"问题说明","evidence":[{"source":"manuscript或outline或rule或timeline","quote":"证据"}],"suggestions":[{"action":"review或rewrite或append","description":"最小修改建议","replacement":"可选替换文本"}]}]}。action=rewrite 时 evidence.quote 必须逐字引用正文中要被替换的连续片段，replacement 只能填写替换后的小说正文；action=append 时 replacement 只能填写需要追加的小说正文。replacement 中禁止写“在某句前插入”“替换为”“修改建议”等操作说明。`;
}

function chapterPlanningPrompt(context: ChapterPlanningContext) {
  return `正式总纲：${JSON.stringify(context.storyPlan)}\n当前分卷：${JSON.stringify(context.volume)}\n当前应推进的故事线：${JSON.stringify(context.storylines ?? [])}\n前序章节（ending 是实际正文结尾，优先级最高）：${JSON.stringify(context.previousChapters)}\n人物：${JSON.stringify(context.characters)}\n人物关系：${JSON.stringify(context.characterRelationships ?? [])}\n硬性规则：${JSON.stringify(context.hardRules)}\n伏笔状态：${JSON.stringify(context.foreshadowings ?? [])}\n最近时间线：${JSON.stringify(context.timeline ?? [])}\n人物认知：${JSON.stringify(context.characterKnowledge ?? [])}\n现有剧情道具：${JSON.stringify(context.storyItems ?? [])}\n目标字数：${context.targetWords}\n附加要求：${context.instruction || "无"}\n\n规划紧接上一章实际结尾的新章节。优先推进最高优先级故事线的 nextNode，可辅助推进其他故事线，但不得把计划节点当成已经发生的事实。人物互动必须符合双方各自态度，可推进 nextDirection 但不得无铺垫跳变。优先复用现有道具；只有现有道具无法承担时才提出新道具候选。不得重复已完成事件或让人物状态倒退。只返回严格 JSON：{"title":"","objective":"","conflict":"","outcome":"","endingHook":"","itemCandidates":[{"name":"","storyFunction":"","whyExistingItemsCannotServe":"","expectedDuration":"","relatedCharacters":[]}],"scenes":[{"title":"","objective":"","conflict":"","outcome":"","targetWords":1000}]}`;
}

function parseChapterPlan(content: string) {
  const parsed = parseObject(content);
  const scenes = Array.isArray(parsed.scenes) ? parsed.scenes as Array<Record<string, unknown>> : [];
  if (!String(parsed.title ?? "").trim() || !scenes.length) throw new Error("模型返回的章节规划不完整");
  const itemCandidates = Array.isArray(parsed.itemCandidates) ? (parsed.itemCandidates as Array<Record<string, unknown>>).slice(0, 3).map((item) => ({ name: String(item.name ?? ""), storyFunction: String(item.storyFunction ?? ""), whyExistingItemsCannotServe: String(item.whyExistingItemsCannotServe ?? ""), expectedDuration: String(item.expectedDuration ?? ""), relatedCharacters: Array.isArray(item.relatedCharacters) ? item.relatedCharacters.map(String) : [] })).filter((item) => item.name && item.storyFunction && item.whyExistingItemsCannotServe) : [];
  return { title: String(parsed.title), objective: String(parsed.objective ?? ""), conflict: String(parsed.conflict ?? ""), outcome: String(parsed.outcome ?? ""), endingHook: String(parsed.endingHook ?? ""), itemCandidates, scenes: scenes.map((scene) => ({ title: String(scene.title ?? "未命名场景"), objective: String(scene.objective ?? ""), conflict: String(scene.conflict ?? ""), outcome: String(scene.outcome ?? ""), targetWords: Math.max(300, Number(scene.targetWords) || 1000) })) };
}

function parseChapterMemory(content: string): ChapterMemoryResult {
  // 在 Provider 边界统一清洗不可信的模型输出，
  // 确保 API 和持久化层只接收长度受限、结构可预测的数据。
  const parsed = parseObject(content);
  const shortSummary = String(parsed.shortSummary ?? "").trim();
  const detailedSummary = String(parsed.detailedSummary ?? "").trim();
  if (!shortSummary || !detailedSummary) throw new Error("模型返回的章节摘要不完整");
  const proposals = Array.isArray(parsed.proposals) ? parsed.proposals.slice(0, 30).map((value) => {
    const item = value as Record<string, unknown>;
    const newValue = item.newValue && typeof item.newValue === "object" && !Array.isArray(item.newValue) ? item.newValue as Record<string, unknown> : {};
    const evidence = item.evidence && typeof item.evidence === "object" && !Array.isArray(item.evidence) ? item.evidence as Record<string, unknown> : {};
    const rawType = String(item.proposalType ?? "event").slice(0, 40);
    // 模型有时会把带日期的事件标记为普通事件。
    // 明确的相对天数可以作为归入时间线的客观依据。
    const proposalType = rawType === "event" && typeof newValue.relativeDay === "number" ? "timeline" : rawType;
    return { proposalType, predicate: String(item.predicate ?? "").slice(0, 80), newValue, evidence };
  }).filter((item) => item.predicate && String(item.evidence.quote ?? "").trim()) : [];
  return { shortSummary, detailedSummary, openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.map(String).filter(Boolean).slice(0, 20) : [], proposals };
}

async function requestChat(config: AiRuntimeConfig, messages: ChatMessage[], maxTokens: number, allowEmpty = false, temperature = 0.75, timeoutMs = 60_000, taskType = "") {
  const startedAt = Date.now();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, messages, temperature, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const body = await response.json() as ChatResponse;
  try { await logAiResponse(config, taskType, body, response.status, Date.now() - startedAt); }
  catch (error) { console.error(`[AI response log] ${taskType || "unknown"} 写入失败`, error); }
  if (!response.ok) throw new Error(`模型请求失败（HTTP ${response.status}）：${body.error?.message ?? "未知错误"}`);
  const content = body.choices?.[0]?.message?.content;
  if (!content && !allowEmpty) throw new Error("模型响应中没有文本内容");
  return content ?? "";
}

export function createOpenAiCompatibleProvider(config: AiRuntimeConfig): AiProvider {
  return {
    async writeScene(context) {
      const messages: ChatMessage[] = [
        { role: "system", content: "输出必须是可解析的 JSON 对象。" },
        { role: "user", content: promptFor(context) },
      ];
      const taskType = context.instruction.startsWith("针对以下审校问题") ? "chapter.repair" : "chapter.continue";
      await logAiPrompt(config, taskType, messages);
      const content = await requestChat(config, messages, 2200, false, 0.75, 60_000, taskType);
      return parseModelJson(content);
    },
    async generateStoryPlan(input) {
      const content = await requestChat(config, [{ role: "system", content: "只返回严格 JSON，不使用 Markdown。" }, { role: "user", content: `${input.defaultPrompt}\n${input.customPrompt}\n题材：${input.genre}\n目标章节数：${input.targetChapters}\n故事创意：${input.brief}\n返回结构：{"premise":"","theme":[],"opening_event":"","opening_hook":"","initial_goal":"","core_payoff":"","long_term_mystery":"","protagonistArc":"","centralConflict":"","worldSummary":"","endingDirection":"","volumes":[{"title":"","objective":"","conflict":"","turningPoint":"","endingHook":""}]}` }], 3200, false, 0.75, 60_000, "story.plan");
      return parseObject(content);
    },
    async generateVolumePlan(input) {
      const messages: ChatMessage[] = [
        { role: "system", content: volumePlanSystemPrompt },
        { role: "user", content: `${input.defaultPrompt}\n\n用户自定义规划偏好：\n${input.customPrompt || "无"}\n\n本次项目资料：\n<genre>${input.genre}</genre>\n<target_chapter_count>${input.targetChapters}</target_chapter_count>\n<story_plan>${JSON.stringify(input.storyPlan)}</story_plan>\n\n本次补充要求：\n<instruction>${input.instruction || "无"}</instruction>\n\n请依据故事阶段确定合理分卷数量，并只返回以下结构：\n{"volumes":[{"title":"卷名","objective":"卷定位、背景、目标、角色、故事线、结果、状态变化、衔接和篇幅","conflict":"核心冲突与升级","turningPoint":"关键剧情节点与高潮","endingHook":"未解决问题与下一卷钩子"}]}` },
      ];
      await logAiPrompt(config, "story.volumes.generate", messages);
      // 长篇总纲可能包含完整人物、故事线和开篇设计，分卷规划使用长任务超时。
      const content = await requestChat(config, messages, 10000, false, 0.75, 180_000, "story.volumes.generate");
      return parseObject(content);
    },
    async planRollingStructure(input) {
      const messages: ChatMessage[] = [
        { role: "system", content: rollingStructurePlannerSystemPrompt },
        { role: "user", content: `${input.defaultPrompt}\n\n用户自定义偏好：${input.customPrompt || "无"}\n\n滚动规划范围：${JSON.stringify(input.horizon)}\n精简 StoryContext：${JSON.stringify(input.context)}\n\n只返回：{"schemaVersion":2,"activeArc":{"title":"","objective":"","centralConflict":"","entryState":{},"exitState":{},"endingDirection":"","futureDirections":[]},"volumes":[{"volumeKey":"active","planningStatus":"active","title":"","objective":"","conflict":"","turningPoint":"","endingHook":"","confidence":90},{"volumeKey":"preview","planningStatus":"preview","title":"","objective":"","conflict":"","turningPoint":"","endingHook":"","confidence":60}],"chapterWindow":[{"title":"","objective":"","conflict":"","outcome":"","endingHook":"","targetWords":3000}],"foreshadowings":[{"key":"","title":"","truth":"","hiddenInformation":[],"purpose":"","importance":"core或supporting","revealPattern":"progressive或layered","commitmentLevel":"commitment或candidate","targetPayoffStage":""}],"placements":[{"foreshadowingKey":"","volumeKey":"active或preview","position":1,"placementType":"seed/reinforce/misdirect/reveal/payoff","required":true,"narrativeIntent":"","allowedInformation":{"reader":[]},"forbiddenInformation":{"reader":[]},"planningStatus":"commitment或candidate"}],"futureDirections":[],"validation":{"passed":true,"issues":[]}}` },
      ];
      await logAiPrompt(config, "story.rolling.plan", messages);
      return parseObject(await requestChat(config, messages, 7500, false, 0.35, 180_000, "story.rolling.plan"));
    },
    async planForeshadowings(input) {
      const messages: ChatMessage[] = [{ role: "system", content: foreshadowPlannerSystemPrompt }, { role: "user", content: `${input.defaultPrompt}\n${input.customPrompt}\nStoryContext：${JSON.stringify(input.context)}\n最多规划 6 条真正影响结构的伏笔，其中核心伏笔最多 4 条、辅助伏笔最多 2 条；字段保持精炼。只返回：{"foreshadowings":[{"key":"stable_key","title":"","truth":"","hiddenInformation":[],"purpose":"","importance":"core或supporting","revealPattern":"progressive/delayed/misdirection/layered/false_answer_then_truth"}]}` }];
      await logAiPrompt(config, "story.foreshadowings.plan", messages);
      return parseObject(await requestChat(config, messages, 10000, false, 0.75, 180_000, "story.foreshadowings.plan"));
    },
    async coordinateNarrative(input) {
      const messages: ChatMessage[] = [{ role: "system", content: narrativeCoordinatorSystemPrompt }, { role: "user", content: `${input.defaultPrompt}\n${input.customPrompt}\n精简故事上下文：${JSON.stringify(input.context)}\n分卷草案：${JSON.stringify(input.volumeDraft)}\n当前唯一伏笔：${JSON.stringify(input.foreshadowingDraft)}\n只处理当前伏笔，不要生成其他伏笔。不要重复输出完整分卷和伏笔定义。只返回必要的分卷微调与落点：{"volumeUpdates":[{"volumeKey":"","conflict":"可选","turningPoint":"可选","endingHook":"可选"}],"placements":[{"foreshadowingKey":"","volumeKey":"","position":1,"placementType":"seed/reinforce/misdirect/reveal/payoff/echo","required":true,"narrativeIntent":"","allowedInformation":{"reader":[]},"forbiddenInformation":{"reader":[]}}]}` }];
      await logAiPrompt(config, "story.narrative.coordinate", messages);
      let parsed: Record<string, unknown>;
      try { parsed = parseObject(await requestChat(config, messages, 10000, false, 0.2, 180_000, "story.narrative.coordinate")); }
      catch (firstError) {
        const retryMessages: ChatMessage[] = [...messages, { role: "user", content: "上一次当前伏笔的 Placement JSON 不完整。请精简每个信息字段并重新完整输出，只处理这一条伏笔，所有字符串、数组和对象必须闭合。" }];
        await logAiPrompt(config, "story.narrative.coordinate.retry", retryMessages);
        try { parsed = parseObject(await requestChat(config, retryMessages, 5000, false, 0.1, 120_000, "story.narrative.coordinate.retry")); }
        catch { throw firstError; }
      }
      const sourceVolumes = Array.isArray(input.volumeDraft.volumes) ? input.volumeDraft.volumes as Array<Record<string, unknown>> : [];
      const updates = Array.isArray(parsed.volumeUpdates) ? parsed.volumeUpdates as Array<Record<string, unknown>> : [];
      // 协调器只返回差异，服务端负责合并，避免模型重复大段分卷文本导致 JSON 截断。
      const volumes = sourceVolumes.map((volume) => ({ ...volume, ...updates.find((item) => String(item.volumeKey) === String(volume.volumeKey)) }));
      const foreshadowings = Array.isArray(input.foreshadowingDraft.foreshadowings) ? input.foreshadowingDraft.foreshadowings : [];
      return { volumes, foreshadowings, placements: Array.isArray(parsed.placements) ? parsed.placements : [] };
    },
    async validateStructure(input) {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: structureValidatorSystemPrompt
        },
        {
          role: "user",
          content: `${input.defaultPrompt}\n${input.customPrompt}\n
          StoryContext：${JSON.stringify(input.context)}\n
          待校验方案：${JSON.stringify(input.coordinatedPlan)}\n
          只返回：{"passed":true,"issues":[{"code":"","severity":"error/warning","message":"","foreshadowingKey":"","affectedVolumeKeys":[],"suggestion":""}],"summary":""}`
        }];
      await logAiPrompt(config, "story.structure.validate", messages);
      try {
        // 校验任务强调稳定结构，不需要创意发散，使用低温减少引号和字段格式错误。
        return parseObject(await requestChat(config, messages, 5200, false, 0.1, 120_000, "story.structure.validate"));
      } catch (firstError) {
        // 模型偶尔会返回未闭合字符串。只重试一次并限制问题数量与字段长度，
        // 后续仍会叠加服务端确定性校验，不会跳过核心伏笔生命周期规则。
        const retryMessages: ChatMessage[] = [...messages, { role: "user", content: "上一次校验结果不是合法 JSON。请重新校验并完整返回，最多 8 个 issues，每个文本字段不超过 120 字；所有属性名和字符串必须使用双引号且闭合，不要尾随逗号。" }];
        await logAiPrompt(config, "story.structure.validate.retry", retryMessages);
        try { return parseObject(await requestChat(config, retryMessages, 4400, false, 0.1, 120_000, "story.structure.validate.retry")); }
        catch { throw firstError; }
      }
    },
    async reviseStructure(input) {
      const messages: ChatMessage[] = [{ role: "system", content: structureReviserSystemPrompt }, { role: "user", content: `${input.defaultPrompt}\n${input.customPrompt}\nStoryContext：${JSON.stringify(input.context)}\n当前方案：${JSON.stringify(input.coordinatedPlan)}\n校验问题：${JSON.stringify(input.validation)}\n不要重复未修改的分卷和伏笔。返回差异及修订后的完整 Placement：{"volumeUpdates":[{"volumeKey":"","conflict":"可选","turningPoint":"可选","endingHook":"可选"}],"foreshadowingUpdates":[{"key":"","truth":"可选","hiddenInformation":[],"purpose":"可选","importance":"core或supporting","revealPattern":"可选"}],"placements":[],"revisionNotes":[{"issueCode":"","change":""}]}` }];
      await logAiPrompt(config, "story.structure.revise", messages);
      let parsed: Record<string, unknown>;
      try { parsed = parseObject(await requestChat(config, messages, 10000, false, 0.1, 180_000, "story.structure.revise")); }
      catch (firstError) {
        const retryMessages: ChatMessage[] = [...messages, { role: "user", content: "上一次修订结果不是完整 JSON。请重新输出：修改说明每项不超过 80 字，只保留解决 error 必需的更新；placements 必须完整，但各信息字段保持精炼。所有字符串和结构必须闭合。" }];
        await logAiPrompt(config, "story.structure.revise.retry", retryMessages);
        try { parsed = parseObject(await requestChat(config, retryMessages, 10000, false, 0.1, 180_000, "story.structure.revise.retry")); }
        catch { throw firstError; }
      }
      const sourceVolumes = Array.isArray(input.coordinatedPlan.volumes) ? input.coordinatedPlan.volumes as Array<Record<string, unknown>> : [];
      const sourceThreads = Array.isArray(input.coordinatedPlan.foreshadowings) ? input.coordinatedPlan.foreshadowings as Array<Record<string, unknown>> : [];
      const volumeUpdates = Array.isArray(parsed.volumeUpdates) ? parsed.volumeUpdates as Array<Record<string, unknown>> : [];
      const threadUpdates = Array.isArray(parsed.foreshadowingUpdates) ? parsed.foreshadowingUpdates as Array<Record<string, unknown>> : [];
      // Reviser 返回差异，服务端合并为下游校验需要的完整方案，减少长 JSON 截断。
      return {
        volumes: sourceVolumes.map((volume) => ({ ...volume, ...volumeUpdates.find((item) => String(item.volumeKey) === String(volume.volumeKey)) })),
        foreshadowings: sourceThreads.map((thread) => ({ ...thread, ...threadUpdates.find((item) => String(item.key) === String(thread.key)) })),
        placements: Array.isArray(parsed.placements) ? parsed.placements : input.coordinatedPlan.placements ?? [],
        revisionNotes: Array.isArray(parsed.revisionNotes) ? parsed.revisionNotes : [],
      };
    },
    async generateStoryBible(input) {
      const messages: ChatMessage[] = [{ role: "system", content: "只返回严格 JSON，不使用 Markdown。" }, { role: "user", content: `${input.defaultPrompt}\n${input.customPrompt}\n题材：${input.genre}\n已有名称（避免重复）：${JSON.stringify(input.existingNames)}\n故事创意：${input.brief}\n返回结构：{"characters":[{"name":"","aliases":[],"gender":"","age":"","role":"主角/配角/反派等","occupation":"","faction":"","archetype":"","personality":"","appearance":"","background":"","flaw":"","fear":"","secret":"","arcStart":"","arcTarget":"","speechStyle":"","coreDesire":"","externalGoal":"","internalNeed":"","behaviorConstraints":[]}],"worldRules":[{"name":"","summary":"","strength":"hard"}],"locations":[],"factions":[],"items":[],"abilities":[]}` }];
      await logAiPrompt(config, "story.bible.generate", messages);
      const content = await requestChat(config, messages, 3200, false, 0.75, 60_000, "story.bible.generate");
      return parseObject(content);
    },
    async generateStorylines(input) {
      const messages: ChatMessage[] = [{ role: "system", content: storylineGeneratorSystemPrompt }, { role: "user", content: `${input.defaultPrompt}\n\n用户自定义提示词：\n${input.customPrompt || "无"}\n\n正式故事总纲：${JSON.stringify(input.storyPlan)}\n已有故事线名称（不得重复）：${JSON.stringify(input.existingNames)}` }];
      await logAiPrompt(config, "story.storylines.generate", messages);
      try {
        return parseObject(await requestChat(config, messages, 5200, false, 0.75, 60_000, "story.storylines.generate"));
      } catch (error) {
        // 部分模型会在长 JSON 的末尾截断；缩小返回规模后只重试一次，避免无限消耗。
        const retryMessages: ChatMessage[] = [...messages, { role: "user", content: "上一次 JSON 不完整。请重新完整输出，最多3条故事线、每条最多3个节点，文本务必精简，必须闭合所有引号、数组和对象。" }];
        await logAiPrompt(config, "story.storylines.generate.retry", retryMessages);
        try { return parseObject(await requestChat(config, retryMessages, 5200, false, 0.75, 60_000, "story.storylines.generate.retry")); } catch { throw error; }
      }
    },
    async refineStoryline(input) {
      const messages: ChatMessage[] = [{ role: "system", content: "你是长篇小说故事线规划师，只返回严格 JSON，不使用 Markdown。" }, { role: "user", content: `依据总纲细化指定故事线。不得把计划节点描述成已经发生的事实，也不要重复已有节点。总纲：${JSON.stringify(input.storyPlan)}\n故事线：${JSON.stringify(input.storyline)}\n已有节点：${JSON.stringify(input.existingNodes)}\n只返回：{"nodes":[{"title":"","objective":"","entryCondition":"","result":""}]}` }];
      await logAiPrompt(config, "story.storyline.refine", messages);
      try {
        return parseObject(await requestChat(config, messages, 3200, false, 0.75, 60_000, "story.storyline.refine"));
      } catch (error) {
        const retryMessages: ChatMessage[] = [...messages, { role: "user", content: "上一次 JSON 不完整。请精简为最多6个节点并重新完整输出，必须闭合 JSON。" }];
        await logAiPrompt(config, "story.storyline.refine.retry", retryMessages);
        try { return parseObject(await requestChat(config, retryMessages, 3200, false, 0.75, 60_000, "story.storyline.refine.retry")); } catch { throw error; }
      }
    },
    async reviewChapter(context) {
      const messages: ChatMessage[] = [
        { role: "system", content: "你是小说一致性审校员。只返回可解析 JSON，不使用 Markdown，不虚构正文外的证据。" },
        { role: "user", content: reviewPrompt(context) },
      ];
      await logAiPrompt(config, "review.continuity", messages);
      const content = await requestChat(config, messages, 3000, false, 0.75, 60_000, "review.continuity");
      return parseReviewFindings(content);
    },
    async repairChapter(context) {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: "你是小说正文修订编辑。只返回严格 JSON。必须返回修订后的完整章节正文，不能只返回补丁或补写段落。",
        },
        {
          role: "user",
          content: `章节：${context.chapterTitle}\n章节规划：${JSON.stringify(context.chapterOutline)}\n硬性规则：${JSON.stringify(context.hardRules)}\n人物：${JSON.stringify(context.characters)}\n审校问题：${JSON.stringify(context.findings)}\n\n当前完整正文：\n${context.manuscript}\n\n逐项修复有明确证据的问题；允许删除重复段落、调整错序和替换矛盾文字；保持无关内容、叙事视角和文风不变。返回：{"prose":"完整修订后的章节正文"}`,
        },
      ];
      await logAiPrompt(config, "chapter.repair", messages);
      const parsed = parseObject(await requestChat(config, messages, 8000, false, 0.75, 60_000, "chapter.repair"));
      const prose = String(parsed.prose ?? "").trim();
      if (!prose) throw new Error("模型返回的修订稿为空");
      return { prose };
    },
    async extractChapterMemory(context: ChapterMemoryContext) {
      // 将记忆提取拆成多个较小的并行请求。部分模型的实际输出上限较低，
      // 如果摘要和全部候选一次返回，很容易在 JSON 中途被截断。
      const sharedContext = `章节：${context.chapterTitle}\n章节卡：${JSON.stringify(context.chapterOutline)}\n人物名单：${JSON.stringify(context.characters)}\n现有人物关系：${JSON.stringify(context.existingRelationships)}\n现有伏笔：${JSON.stringify(context.existingForeshadowings)}\n最近时间线：${JSON.stringify(context.recentTimeline)}\n现有人物认知：${JSON.stringify(context.existingKnowledge)}\n现有剧情道具：${JSON.stringify(context.existingItems)}\n\n完整正文：\n${context.manuscript.slice(0, 100000)}`;
      const summaryMessages: ChatMessage[] = [
        { role: "system", content: "你是长篇小说记忆提取器。必须通读所给完整正文，只返回严格 JSON；不得把推测写成事实。" },
        { role: "user", content: `${context.defaultSummaryPrompt}\n${context.customSummaryPrompt}\n\n${sharedContext}\n\n短摘要必须概括整章因果链，不得只复述开头，100至200字；详细摘要按顺序覆盖开端、发展、转折和结尾，最多800字；未解决问题最多10项。返回：{"shortSummary":"","detailedSummary":"","openQuestions":[]}` },
      ];
      const ordinaryMessages: ChatMessage[] = [
        { role: "system", content: "你是小说状态提取器。只返回严格 JSON。候选宁缺毋滥，不得输出无原文证据的推测。" },
        { role: "user", content: `${context.defaultStatePrompt}\n${context.customStatePrompt}\n\n${sharedContext}\n\n提取已发生的普通状态，以及有明确互动证据的人物关系建立或变化。关系必须填写名单中的两个人物、当前关系类型、当前状态、双方各自态度和下一步方向；已有关系填写 existingId。不要把单纯同场出现当作关系变化。最多8项。返回：{"proposals":[{"proposalType":"character/relationship/item/location/ability/event","predicate":"中文可读标题","newValue":{"title":"","description":"","existingId":"","sourceName":"","targetName":"","relationType":"陌生/亲属/朋友/同事/师徒/盟友/敌对/复杂","relationshipStatus":"陌生/接触/合作/亲近/紧张/敌对/破裂/隐藏","sourceAttitude":"","targetAttitude":"","nextDirection":"","relativeDay":null,"locationName":"","characterName":""},"evidence":{"quote":"不超过80字的正文原句","reason":"不超过40字"}}]}` },
      ];
      const storyMemoryMessages: ChatMessage[] = [
        { role: "system", content: "你是小说伏笔、时间线和人物认知提取器。只返回严格 JSON，必须有原文证据。" },
        { role: "user", content: `${sharedContext}\n\n提取四类：foreshadowing（伏笔）、timeline（时间节点）、knowledge（人物认知）、story_item（值得长期追踪的剧情道具）。道具只有满足至少两项才提取：改变事件结果；发生获得/转交/隐藏/损坏/使用；关联伏笔秘密；后续仍会使用；多人围绕它行动；有明确限制代价。普通环境物品和一次性用品不要提取。已有道具变化填写 existingId；新道具说明现有道具为何不能替代。人物名必须来自名单。总计最多8项；description 不超过80字，quote 不超过80字。返回：{"proposals":[{"proposalType":"foreshadowing/timeline/knowledge/story_item","predicate":"中文可读标题","newValue":{"title":"","description":"","existingId":"","action":"planted/reinforced/misdirected/resolved/updated/transferred/damaged/used","importance":3,"itemType":"线索/凭证/武器/装备/媒介/任务物品","holderName":"","locationName":"","status":"intact/lost/damaged/consumed/destroyed/sealed","storyFunction":"","nextPlan":"","relatedCharacters":[],"relatedForeshadowingIds":[],"relativeDay":null,"characterName":"","proposition":"","state":"knows/believes/suspects/does_not_know"},"evidence":{"quote":"正文原句","reason":""}}]}` },
      ];
      await Promise.all([
        logAiPrompt(config, "chapter.summary", summaryMessages),
        logAiPrompt(config, "state.extract.ordinary", ordinaryMessages),
        logAiPrompt(config, "state.extract.story_memory", storyMemoryMessages),
      ]);
      async function requestMemoryPart(taskType: string, messages: ChatMessage[], maxTokens: number, retryInstruction: string) {
        try {
          return parseObject(await requestChat(config, messages, maxTokens, false, 0.2, 60_000, taskType));
        } catch (firstError) {
          // 只重试解析失败的子任务，已经成功的摘要或候选不会再次调用模型。
          // 重试时进一步压缩输出，降低兼容服务截断 JSON 的概率。
          const retryMessages: ChatMessage[] = [...messages, { role: "user", content: `上次输出无法解析，请重新生成。${retryInstruction}\n只返回单个完整 JSON 对象；字符串内如需换行必须写成 \\n，不能直接换行。` }];
          await logAiPrompt(config, `${taskType}.retry`, retryMessages);
          try {
            return parseObject(await requestChat(config, retryMessages, maxTokens, false, 0.1, 60_000, `${taskType}.retry`));
          } catch {
            throw firstError;
          }
        }
      }
      const [summary, ordinary, storyMemory] = await Promise.all([
        requestMemoryPart("chapter.summary", summaryMessages, 2200, "详细摘要缩短到500字以内，未解决问题最多6项。"),
        requestMemoryPart("state.extract.ordinary", ordinaryMessages, 2800, "候选最多4项，每个文本字段不超过50字。"),
        requestMemoryPart("state.extract.story_memory", storyMemoryMessages, 3200, "候选最多4项，每个文本字段不超过50字。"),
      ]);
      const proposals = [
        ...(Array.isArray(ordinary.proposals) ? ordinary.proposals : []),
        ...(Array.isArray(storyMemory.proposals) ? storyMemory.proposals : []),
      ];
      return parseChapterMemory(JSON.stringify({ ...summary, proposals }));
    },
    async planChapter(context) {
      const messages: ChatMessage[] = [{ role: "system", content: "你是长篇小说章节规划器。严格承接已有正式设定，只返回 JSON。" }, { role: "user", content: chapterPlanningPrompt(context) }];
      await logAiPrompt(config, "autopilot.chapter.plan", messages);
      const content = await requestChat(config, messages, 2200, false, 0.75, 60_000, "autopilot.chapter.plan");
      return parseChapterPlan(content);
    },
  };
}

export async function testOpenAiCompatibleConnection(config: AiRuntimeConfig) {
  const content = await requestChat(config, [
    { role: "user", content: "只回复两个汉字：可用" },
  // 某些推理模型会把较小的输出额度全部用于内部推理。
  // 即使正文为空，HTTP 成功也足以证明地址、密钥和模型可以访问。
  ], 256, true, 0.75, 60_000, "ai.connection.test");
  return content.trim().slice(0, 80) || "模型接口已成功响应";
}
