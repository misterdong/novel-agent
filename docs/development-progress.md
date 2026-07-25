# Novel Agent 开发进度

- 文档版本：V1.0
- 最近同步：2026-07-18
- 当前阶段：P0 核心创作闭环开发
- 开发方法：依据 PRD 优先级，按可运行的纵向功能切片推进

## 1. 状态定义

| 状态 | 含义 |
|---|---|
| 已完成 | 功能代码、数据结构和基础验证均已完成 |
| 基础完成 | 主流程可用，但仍缺少增强能力或完整交互 |
| 开发中 | 已有代码或迁移，尚未完成全部验证或交互 |
| 未开始 | 仅在需求和设计文档中定义 |

## 2. 总体进度

| 模块 | PRD优先级 | 状态 | 当前成果 | 后续工作 |
|---|---|---|---|---|
| 本地开发环境 | P0基础 | 已完成 | Docker Desktop、PostgreSQL 16、pgvector、Next.js | 补充一键环境检查脚本 |
| 项目管理 | P0 | 基础完成 | 创建项目、首卷、首章和初始正文版本 | 项目选择器、重命名、归档、回收站 |
| 卷章管理 | P0 | 基础完成 | 章节列表、新建章节、章节切换、标题和状态更新 | 分卷 CRUD、章节排序、拆分与合并 |
| 正文编辑 | P0 | 基础完成 | 正文编辑、字数统计、自动保存、保存状态 | 富文本编辑器、锁定区块、快捷键 |
| 正文版本 | P0 | 已完成 | 不可变快照、版本列表、恢复为新版本 | 版本差异对比、版本命名 |
| AI续写演示 | P0验证 | 基础完成 | Mock AI 候选续写、接受、拒绝、重新生成 | 替换为持久化 AI 任务系统 |
| 故事圣经 | P0 | 基础完成 | 人物、规则、地点、势力、物品和能力条目 | 编辑、删除、搜索、关联章节、影响分析 |
| 人物卡 | P0 | 基础完成 | 人物独立数据表、核心欲望、外部目标和人物认知 | 完整人物字段、关系和状态历史 |
| 五层故事大纲 | P0 | 基础完成 | 故事总纲、分卷、故事线、关键事件、章节规划统一工作台 | 故事线编辑、事件关联、影响分析和可视化 |
| 章节卡 | P0 | 基础完成 | 章节目标、冲突、结果、钩子、保存与工作台接入 | 锁定字段、关联人物与伏笔 |
| 场景卡 | P0 | 基础完成 | 创建、编辑、排序、删除、状态接口和工作台读取 | 拖拽排序、完整字段编辑表单 |
| AI任务系统 | P0 | 基础完成 | 数据库队列、独立Worker、轮询、取消、重试、OpenAI兼容Provider与持久化输出 | 多Worker抢占、任务租约、流式输出 |
| 自动创作编排 | P0 | 基础完成 | 自动生成一章的持久化状态机、章节与场景规划、正文生成、审校、自动修复、暂停恢复 | 扩展到整卷与全书、预算和租约 |
| 自动创作日志 | P0 | 基础完成 | 阶段事件、模型调用、耗时、检查、修复、控制操作和错误持久化，页面时间线展示 | 接入 Provider Token 用量与价格表 |
| 上下文组装 | P0 | 基础完成 | 章节卡、场景卡、硬性规则和人物卡清单 | 人物状态、摘要和历史混合检索 |
| 章节摘要 | P0 | 基础完成 | 按正文版本生成短摘要、详细摘要和未解决问题 | 接入真实模型、事件级摘要 |
| 状态变化审批 | P0 | 基础完成 | 提案生成、审批界面、接受后原子写入正式事实 | 旧值对比、冲突处理、批量审批 |
| 一致性检查 | P0 | 基础完成 | 问题持久化、严重度、证据、忽略状态和修复预览 | 更多规则、定位锚点、局部替换 |
| 伏笔管理 | P0 | 基础完成 | 核心/辅助伏笔定义、分卷/章节 Placement、正文 Occurrence，以及分卷与伏笔联合规划闭环 | 章节级 Placement 细化、正文执行追踪 |
| 时间线 | P0 | 基础完成 | 事件创建、相对天数、地点和顺序视图 | 自动提取、章节筛选、事件依赖 |
| 导出 | P0 | 未开始 | 已定义 TXT、Markdown、DOCX | 导出服务、格式选项和下载 |

## 3. 已完成的开发切片

### 3.0 伏笔规划数据分层

- 分卷规划器不再负责具体伏笔设计。
- 伏笔区分核心伏笔与辅助伏笔。
- 新增 `foreshadowing_placements`，支持分卷必填、章节可空的渐进式绑定。
- Placement 记录生命周期动作、叙事意图、允许信息、禁止信息、必要性和执行状态。
- `foreshadowing_occurrences` 保留为正文事实层，并可关联 Placement。
- 故事管理页面支持创建新伏笔、添加分卷/章节落点、更新状态和删除。
- 已实现 ForeshadowPlanner、NarrativeCoordinator、Validation 与单轮 Reviser。

相关文件：

- [`docs/volume-foreshadowing-planning.md`](./volume-foreshadowing-planning.md)
- [`db/schema.ts`](../db/schema.ts)
- [`app/api/story-management/route.ts`](../app/api/story-management/route.ts)
- [`components/story-management-workspace.tsx`](../components/story-management-workspace.tsx)

### 3.1 基础设施与数据库

- Docker 中运行 PostgreSQL 16 和 pgvector。
- 使用 Drizzle ORM 管理 Schema 和迁移。
- 已启用 `vector` 和 `citext` 扩展。
- 本地环境变量和数据库连接已配置。

相关文件：

- [`compose.yaml`](../compose.yaml)
- [`db/schema.ts`](../db/schema.ts)
- [`drizzle/0000_complex_bulldozer.sql`](../drizzle/0000_complex_bulldozer.sql)

### 3.2 创作工作台

- 三栏创作界面。
- 从数据库加载项目、卷、章节和正文。
- 章节切换和新建章节。
- 正文自动保存。
- 使用最后已保存正文作为基线，避免页面加载产生重复版本。
- Mock AI 续写候选支持接受、拒绝和重新生成。

相关文件：

- [`components/writing-workspace.tsx`](../components/writing-workspace.tsx)
- [`app/api/workspace/route.ts`](../app/api/workspace/route.ts)

### 3.3 正文版本管理

- 每次保存追加不可变版本。
- 支持版本历史列表。
- 恢复历史内容时创建新的头版本，不覆盖旧版本。
- 章节字数和正文版本在事务内同步更新。

相关文件：

- [`app/api/chapters/[chapterId]/versions/route.ts`](../app/api/chapters/[chapterId]/versions/route.ts)
- [`app/api/chapters/[chapterId]/route.ts`](../app/api/chapters/[chapterId]/route.ts)

### 3.4 故事圣经

- 新增人物独立数据表。
- 新增通用故事设定表。
- 支持硬性设定和软性参考。
- 提供人物与设定创建、读取页面。

相关文件：

- [`app/bible/page.tsx`](../app/bible/page.tsx)
- [`components/story-bible-workspace.tsx`](../components/story-bible-workspace.tsx)
- [`app/api/story-bible/route.ts`](../app/api/story-bible/route.ts)
- [`drizzle/0001_daily_chamber.sql`](../drizzle/0001_daily_chamber.sql)

## 4. 最近完成的切片

### 4.1 章节卡与场景卡

目标：建立“章节目标 → 场景目标 → 正文生成”的结构化规划链路。

已写入：

- `scenes` 数据表和顺序约束。
- 章节卡读取与保存接口。
- 场景卡创建接口。
- 大纲规划页面。
- 章节目标、核心冲突、章节结果和结尾钩子字段。
- 场景名称、目标字数和顺序展示。

已补充完成：

- ESLint、TypeScript 和生产构建验证通过。
- 使用真实示例数据验证章节卡保存与场景创建。
- 场景卡编辑、排序、删除和状态更新接口。
- 创作工作台读取真实场景卡，替换固定演示内容。
- 场景排序使用事务和临时位置，避免违反唯一索引。

### 4.2 持久化 AI 任务基础闭环

- 建立统一 `AiProvider` 契约和确定性 Mock Provider。
- 生成请求写入 `generation_runs`，保存任务状态、用户指令、上下文清单和输出。
- 上下文包含章节卡、首个场景卡、硬性规则和人物卡。
- 创作工作台已替换前端定时器 Mock，改为调用持久化任务接口。
- AI 候选被接受后，正文版本来源标记为 `ai`。

### 4.3 异步 AI Worker

- `POST /api/generations` 只创建 `queued` 任务，不在请求周期执行模型。
- 独立 Worker 按创建时间轮询队列并执行 Mock Provider。
- 前端轮询任务状态，支持生成期间取消。
- 失败或取消任务可通过统一动作接口重新入队。
- Worker 完成写入前重新检查取消状态，避免取消任务被覆盖成完成。
- 已验证 `queued → running → completed` 状态流转。

### 4.4 章节摘要与状态变化审批

- 摘要与具体正文版本绑定，同一版本重复提取会更新而不重复创建摘要。
- 支持短摘要、详细摘要和未解决问题。
- 从正文生成待审批状态变化提案，并显示证据。
- 用户可接受或拒绝单条提案。
- 接受提案与正式 `story_facts` 写入处于同一事务。
- 已验证接受提案后正式事实可查询。

### 4.5 一致性检查与修复预览

- 检查结果绑定具体正文版本，保存检查类型、严重度、证据和建议。
- 支持错误、警告和建议三级严重程度。
- 支持 open、fixed、ignored 和 false_positive 状态。
- 修复建议先显示当前正文结尾与候选文本，不自动修改正文。
- 用户确认应用后由自动保存创建 `rewrite` 来源的新正文版本。
- 已验证章节卡事件缺失与硬性规则铺垫检查。

### 4.6 故事管理

- 新增伏笔、伏笔出现记录、时间线事件和人物认知数据结构。
- 伏笔支持计划、埋设、强化、误导、回收和放弃状态流转。
- 时间线支持相对天数和地点记录，并按时间顺序展示。
- 人物认知支持知道、相信、怀疑和尚不知道四种视角状态。
- 人物认知与客观故事事实分开保存，不会未经审批写入正式事实。
- 已使用真实示例数据验证三类记录的创建与读取。

### 4.7 真实模型接入

- 新增 OpenAI Chat Completions 兼容 Provider，可接入 DeepSeek 等兼容服务。
- Worker 根据 `.env` 动态选择真实模型或 Mock Provider。
- 页面展示当前 Provider 和模型，并提供不暴露密钥的连接测试。
- 模型错误写入失败任务，接口和日志不返回 API Key。
- 已验证 `deepseek-v4-flash` 返回“可用”，并重启真实模型 Worker。

### 4.8 提示词管理

- 建立独立提示词目录，列出场景续写、章节摘要、状态提取、一致性检查、剧情检查和局部改写。
- 每类任务提供只读系统默认提示词和可启停的作品级自定义提示词。
- 场景续写已接入运行时合并，顺序为默认模板、自定义模板、结构化上下文和单次要求。
- 默认续写模板增加自然段数量、对白分段和空行排版约束。
- 其他任务模板已预留并标记为待接入，避免将尚未调用模型的能力误报为已生效。

### 4.9 AI 故事资产生成

- 新增故事创意输入页，支持故事总纲和故事圣经两类生成任务。
- 两类任务复用数据库队列、独立 Worker、真实 Provider 和提示词管理。
- 总纲输出包含核心命题、主题、人物弧、核心冲突、世界概述、结局方向和分卷规划。
- 故事圣经输出包含人物、规则、地点、势力、物品和能力候选。
- 生成结果必须由用户确认；接受总纲不删除现有章节，故事圣经写入时跳过同名条目。
- 已用真实模型验证总纲任务 `queued → running → completed` 和结构化输出，测试候选未写入正式数据。

### 4.10 五层故事大纲

- 将原“大纲”页面中的章节编辑器重新定位为第五层“章节规划”。
- 新增故事总纲编辑，覆盖核心创意、主题、核心冲突、人物弧、世界概述和结局方向。
- 新增分卷规划视图，读取各卷阶段目标。
- 新增故事线数据表和创建能力，用于区分主线、谜团线、人物线等并行结构。
- 新增关键事件数据表和因果链视图，记录事件原因与后果。
- 五层结构与现有章节卡、场景卡共用同一大纲工作台。

相关文件：

- [`app/outline/page.tsx`](../app/outline/page.tsx)
- [`components/outline-workspace.tsx`](../components/outline-workspace.tsx)
- [`app/api/outline/route.ts`](../app/api/outline/route.ts)
- [`drizzle/0002_serious_mentor.sql`](../drizzle/0002_serious_mentor.sql)

## 5. 下一开发顺序

1. 将卷级 Placement 细化为章节级执行计划，并接入章节规划。
2. 为自动创作增加卷级循环、Token/金额预算和任务租约。
3. 实现作品导出。

### 4.12 分卷与伏笔联合规划

- 新增 `story.structure.coordinate` 持久化生成任务和联合规划页面入口。
- 使用统一 StoryContext，并行职责上分离分卷规划与伏笔规划。
- NarrativeCoordinator 使用稳定 key 绑定分卷和伏笔，生成 Placement 生命周期。
- Validation 同时执行模型语义检查与确定性规则检查。
- 校验问题按伏笔分组调用 Reviser；单条修订失败转人工复核，不阻断其他伏笔和 FinalPlan。
- 接受 FinalPlan 时，在一个数据库事务中保存分卷、伏笔和 Placement。
- 故事管理支持人工编辑或删除伏笔及 Placement；无效落点不会阻断联合规划入库。
- Mock Provider 提供双卷、核心伏笔埋设与回收的确定性验收数据。
- 故事总纲补充开篇事件、开篇钩子、初始目标、核心爽点和长期悬念，并纳入 AI 总纲生成与后续联合规划上下文。
- 人物生成支持“指定人物提炼”和“总纲候选生成”两种模式；指定模式只生成输入描写中的一个人物，并保留既定姓名、经历、能力与人物弧。
- 故事线生成提示词已拆分到独立文件，接入提示词目录、项目级自定义提示词和统一调用日志。
- 叙事协调改为精简上下文和逐伏笔 Placement 规划，并增加单伏笔级断点恢复，降低长 JSON 截断风险。

相关文件：

- [`lib/ai/process-generation.ts`](../lib/ai/process-generation.ts)
- [`lib/ai/prompts/foreshadow-planner.ts`](../lib/ai/prompts/foreshadow-planner.ts)
- [`lib/ai/prompts/narrative-coordinator.ts`](../lib/ai/prompts/narrative-coordinator.ts)
- [`lib/ai/prompts/structure-validator.ts`](../lib/ai/prompts/structure-validator.ts)
- [`lib/ai/prompts/structure-reviser.ts`](../lib/ai/prompts/structure-reviser.ts)
- [`components/asset-generator-workspace.tsx`](../components/asset-generator-workspace.tsx)

### 4.11 Autopilot 自动创作

- 新增 `autopilot_runs`，持久化任务状态、当前阶段、进度、章节、场景索引和修复次数。
- 新增自动生成一章控制页面，支持目标字数、附加要求、最大修复次数、暂停、继续、终止和失败重试。
- Worker 状态机自动执行章节规划、场景拆分、逐场景正文生成、人物候选正式化、AI 一致性检查、有限次数修复和章节完成。
- 每个场景与修复结果均创建不可变正文版本，自动流程不会覆盖历史版本。
- 新增 `planChapter` Provider 契约及 OpenAI 兼容实现。
- 当前自动化范围限定为一章；整卷、整本循环及成本预算仍为下一阶段。
- 新增 `autopilot_events` 追加式事件日志，记录任务创建、阶段流转、模型与耗时、场景生成、审校、修复、暂停、恢复、终止和失败。
- 自动创作页面支持按任务展开执行日志，并查看结构化详细信息。
- 已预留 prompt/completion tokens 和估算成本字段；当前 Provider 尚未返回 usage，数值暂为 0。

相关文件：

- [`app/autopilot/page.tsx`](../app/autopilot/page.tsx)
- [`components/autopilot-workspace.tsx`](../components/autopilot-workspace.tsx)
- [`app/api/autopilot/route.ts`](../app/api/autopilot/route.ts)
- [`lib/ai/process-autopilot.ts`](../lib/ai/process-autopilot.ts)
- [`drizzle/0008_bored_mindworm.sql`](../drizzle/0008_bored_mindworm.sql)
- [`drizzle/0009_mushy_shaman.sql`](../drizzle/0009_mushy_shaman.sql)

## 6. 当前验收记录

| 检查项 | 状态 | 说明 |
|---|---|---|
| Docker PostgreSQL健康状态 | 通过 | PostgreSQL 与 pgvector 正常运行 |
| 基础数据库迁移 | 通过 | 项目、卷章、正文和AI任务表已创建 |
| 故事圣经迁移 | 通过 | 人物与设定表已创建 |
| 场景规划迁移 | 通过 | `scenes` 表已创建 |
| 创作工作台生产构建 | 通过 | 此前切片已完成构建验证 |
| 故事圣经生产构建 | 通过 | 页面与接口已完成构建验证 |
| 章节卡与场景卡最终构建 | 通过 | 场景 CRUD、排序与工作台读取已验证 |
| 持久化 AI 任务接口 | 通过 | 任务、上下文清单和 Mock 输出已写入数据库 |
| 异步 AI Worker | 通过 | 已验证 queued、running、completed 状态流转及轮询读取 |
| 章节摘要与状态审批 | 通过 | 摘要持久化、提案接受和正式事实事务写入已验证 |
| 一致性检查与修复预览 | 通过 | 问题生成、证据、忽略状态和候选修复预览已验证 |
| 故事管理 | 通过 | 伏笔、时间线和人物认知的迁移、接口与页面构建已验证 |
| 真实模型连接 | 通过 | OpenAI兼容接口、模型配置读取和 DeepSeek 最小请求已验证 |
| 提示词管理 | 通过 | 提示词目录、作品级自定义保存与续写 Worker 读取已验证 |
| AI故事资产生成 | 通过 | 真实模型总纲候选、审批边界与正式数据写入接口已验证 |
| 五层故事大纲 | 通过 | 总纲、分卷、故事线、关键事件和章节规划的结构、接口与页面构建已验证 |

## 7. 进度同步规则

每个开发切片结束后更新：

1. 模块状态和当前成果。
2. 新增或变更的主要文件。
3. 数据库迁移编号。
4. ESLint、TypeScript、构建和接口验证结果。
5. 已知问题和下一步任务。

只有代码、迁移和基础验证均完成后，模块才能标记为“已完成”；仅有页面或接口时标记为“基础完成”或“开发中”。
# 长篇滚动规划 v2（2026-07-19）

- 已将全书一次性联合规划替换为 `story.rolling.plan`。
- 单个周期只详细生成：当前故事阶段、当前卷、下一卷预览、最近 5 章窗口，以及当前/预备卷内的伏笔落点。
- 远期剧情只保存 `futureDirections`，核心伏笔通过 `targetPayoffStage` 保留远期承诺，不提前生成具体远期卷。
- 新增 `planning_cycles`、`story_arcs`、`story_state_snapshots`，并为分卷、伏笔、Placement、故事线增加规划状态字段。
- 正式故事总纲统一标记为 `schemaVersion: 2`；旧版联合规划结果不再允许确认写入。
- 接受新周期时只保留最新周期、故事阶段和候选 Placement；已有分卷关联使用 `set null`，不会级联删除章节正文。
- 数据库迁移：`drizzle/0016_condemned_junta.sql`，已执行。
- 生产构建已通过。
