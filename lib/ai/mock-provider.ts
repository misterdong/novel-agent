import type { AiProvider } from "./provider";

export const mockProvider: AiProvider = {
  async writeScene(context) {
    // 确定性的 Mock Provider 可以在没有网络密钥和模型费用的情况下测试完整流程；
    // 真实 Provider 只需实现相同接口。
    const scene = context.sceneTitle ?? "当前场景";
    const ruleHint = context.hardRules[0]?.name ? `他想起了“${context.hardRules[0].name}”的限制。` : "";
    return {
      prose: `林默没有立刻回答。${ruleHint}\n\n${scene}里的空气像被什么无形的东西压低了。老人从风衣内袋取出一张发黄的照片，轻轻推到分诊台上。照片中的手术室空无一人，墙上的电子钟停在三年前那个雨夜。\n\n而手术台旁，站着另一个林默。`,
      coveredEvents: [String(context.sceneOutline?.objective ?? context.chapterOutline.objective ?? "推进当前场景")],
      characterCandidates: [],
    };
  },
  async generateStoryPlan(input) {
    return { premise: input.brief, theme: ["选择与代价"], opening_event: "一场异常事件打破主角的日常秩序", opening_hook: "主角发现异常似乎只针对自己", initial_goal: "查明异常并保证自身安全", core_payoff: "主角利用独特能力反制强敌并持续揭开规则", long_term_mystery: "异常为何选择主角，以及幕后规则由谁建立", protagonistArc: "从逃避真相到主动承担", centralConflict: "主角追查异常时不断触碰世界规则", worldSummary: "一个表面正常、暗处存在异常规则的现代世界", endingDirection: "主角揭开真相并付出代价", volumes: [{ title: "第一卷 · 异常来客", objective: "建立能力与核心谜团", conflict: "追查真相会暴露主角", turningPoint: "盟友隐瞒关键事实", endingHook: "异常来自主角自身" }] };
  },
  async generateVolumePlan(input) {
    // 联合规划要求核心伏笔至少跨越两个分卷，因此 Mock 也返回可验证的最小双卷结构。
    return { volumes: [
      { title: "第一卷 · 故事起点", objective: String(input.storyPlan.centralConflict ?? input.storyPlan.premise ?? "建立核心冲突"), conflict: "主角第一次直面核心阻力", turningPoint: "原有认知被打破", endingHook: "更大的代价浮现" },
      { title: "第二卷 · 真相代价", objective: "让核心冲突产生不可逆结果", conflict: "揭开真相与守住已有生活无法兼得", turningPoint: "主角主动承担选择的代价", endingHook: "旧问题解决后出现新的长期目标" },
    ] };
  },
  async planRollingStructure() {
    return { schemaVersion: 2, activeArc: { title: "异常初显", objective: "建立核心冲突并迫使主角行动", centralConflict: "求生与追查真相互相牵制", entryState: {}, exitState: { protagonist: "主动追查" }, endingDirection: "发现异常背后存在组织力量", futureDirections: ["扩大冲突范围", "让主角第一次承担选择代价"] }, volumes: [
      { volumeKey: "active", planningStatus: "active", title: "第一卷 · 异常初显", objective: "确认异常并建立行动目标", conflict: "暴露能力会招致追捕", turningPoint: "主角发现敌人掌握其过去", endingHook: "幕后组织正式现身", confidence: 90 },
      { volumeKey: "preview", planningStatus: "preview", title: "第二卷 · 规则代价", objective: "让第一卷选择产生后果", conflict: "利用规则与保护亲友无法兼得", turningPoint: "盟友关系发生变化", endingHook: "更大范围的规则被揭示", confidence: 60 },
    ], chapterWindow: [{ title: "异常发生", objective: "打破日常", conflict: "主角被迫隐藏异常", outcome: "主角确认威胁真实存在", endingHook: "追踪者出现", targetWords: 3000 }], foreshadowings: [{ key: "identity_truth", title: "身份记录异常", truth: "主角与旧实验有关", hiddenInformation: ["实验过程"], purpose: "连接身世与核心冲突", importance: "core", revealPattern: "layered", commitmentLevel: "commitment", targetPayoffStage: "中后期" }], placements: [{ foreshadowingKey: "identity_truth", volumeKey: "active", position: 1, placementType: "seed", required: true, narrativeIntent: "建立长期谜团", allowedInformation: { reader: ["记录异常"] }, forbiddenInformation: { reader: ["完整实验真相"] }, planningStatus: "commitment" }], futureDirections: ["中期揭示实验目的"], validation: { passed: true, issues: [] } };
  },
  async planForeshadowings() {
    return { foreshadowings: [{ key: "identity_truth", title: "被篡改的身份记录", truth: "主角的身份与核心实验有关", hiddenInformation: ["实验的完整过程", "幕后知情者身份"], purpose: "串联主角身份谜团与最终真相", importance: "core", revealPattern: "layered" }] };
  },
  async coordinateNarrative(input) {
    const volumes = Array.isArray(input.volumeDraft.volumes) ? input.volumeDraft.volumes as Array<Record<string, unknown>> : [];
    const foreshadowings = Array.isArray(input.foreshadowingDraft.foreshadowings) ? input.foreshadowingDraft.foreshadowings as Array<Record<string, unknown>> : [];
    const key = String(foreshadowings[0]?.key ?? "identity_truth");
    return { volumes, foreshadowings, placements: volumes.flatMap((volume, index) => index === 0 ? [{ foreshadowingKey: key, volumeKey: String(volume.volumeKey), position: 1, placementType: "seed", required: true, narrativeIntent: "建立异常", allowedInformation: { reader: ["身份记录异常"] }, forbiddenInformation: { reader: ["完整真相"] } }] : index === volumes.length - 1 ? [{ foreshadowingKey: key, volumeKey: String(volume.volumeKey), position: 2, placementType: "payoff", required: true, narrativeIntent: "真相产生剧情后果", allowedInformation: { reader: ["完整真相"] }, forbiddenInformation: { reader: [] } }] : []) };
  },
  async validateStructure() {
    return { passed: true, issues: [], summary: "Mock 联合规划校验通过" };
  },
  async reviseStructure(input) {
    return { ...input.coordinatedPlan, revisionNotes: [] };
  },
  async generateStoryBible() {
    return { characters: [], worldRules: [], locations: [], factions: [], items: [], abilities: [] };
  },
  async generateStorylines() {
    return { storylines: [{ name: "核心冲突线", storylineType: "main", summary: "主角逐步接近核心真相并承担代价", coreQuestion: "真相是否值得付出代价", initialState: "主角尚未意识到异常全貌", targetOutcome: "主角完成最终选择", coreConflict: "追查真相会持续伤害主角珍视的人", currentProgress: "", nextPlan: "发现第一条不可忽视的线索", completionCriteria: "核心真相揭晓且主角作出不可逆选择", priority: "core", nodes: [{ title: "异常显现", objective: "让主角确认异常真实存在", entryCondition: "日常秩序已经建立" }, { title: "代价升级", objective: "让追查行为产生无法回避的损失", entryCondition: "主角已经主动追查" }] }] };
  },
  async refineStoryline() {
    return { nodes: [{ title: "新的推进节点", objective: "使故事线状态发生明确变化", entryCondition: "前序节点已经完成", result: "" }] };
  },
  async reviewChapter() {
    // Mock 模式复用真实持久化路径，但不会伪装成已经完成语义审校。
    return [];
  },
  async repairChapter(context) {
    // Mock 修复保持正文不变，仅用于验证版本持久化流程。
    return { prose: context.manuscript };
  },
  async extractChapterMemory(context) {
    const compact = context.manuscript.replace(/\s+/g, " ").trim();
    return { shortSummary: compact.slice(0, 180) || "本章尚无正文。", detailedSummary: compact.slice(0, 1200) || "本章尚无正文。", openQuestions: [], proposals: [] };
  },
  async planChapter(context) {
    const perScene = Math.max(500, Math.round(context.targetWords / 3));
    return { title: "自动规划的新章节", objective: "推进当前分卷的核心目标", conflict: "主角的行动遭遇新的阻力", outcome: "局势发生不可逆变化", endingHook: "新的线索指向更深层的真相", itemCandidates: [], scenes: [1, 2, 3].map((position) => ({ title: `场景 ${position}`, objective: `完成本章第 ${position} 个推进`, conflict: "行动受到阻碍", outcome: "获得新信息", targetWords: perScene })) };
  },
};
