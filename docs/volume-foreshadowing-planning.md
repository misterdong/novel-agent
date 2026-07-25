# 分卷与伏笔联合规划设计

## 1. 目标

分卷规划与伏笔规划不再由同一个提示词一次完成。两个规划器先独立产生草案，再由叙事协调器建立绑定关系，统一校验并做最小修订。

```text
StoryContext
    ├──────────────┐
    ↓              ↓
VolumePlanner   ForeshadowPlanner
    │              │
    └──────┬───────┘
           ↓
NarrativeCoordinator
           ↓
       Validation
           ↓
    不通过 → Reviser
           ↓
        FinalPlan
       ┌────┴────┐
       ↓         ↓
    Volume  Foreshadowing
                  ↓
       ForeshadowingPlacement
```

## 2. 职责边界

### VolumePlanner

只规划分卷数量、阶段目标、冲突、高潮、状态变化和卷间因果关系。不设计具体伏笔，也不决定伏笔在哪一卷出现。

### ForeshadowPlanner

只定义伏笔的真相、隐藏信息、叙事目的、重要程度和抽象揭示模式。不指定具体分卷或章节。

伏笔分为：

- `core`：支撑主线真相、结局或关键人物弧，必须跨越多个分卷。
- `supporting`：服务单卷悬念、支线、人物关系或局部反转，可以在较短范围内完成。

### NarrativeCoordinator

接收分卷草案和伏笔草案，生成 Placement。允许补充信息揭露节点、微调转折或卷末钩子，但不能改变总纲、分卷核心目标、人物结局和世界硬规则。

### Validation 与 Reviser

检查卷间因果、核心伏笔跨卷覆盖、提前揭示、人物知识边界、伏笔密度和最终回收。Reviser 只根据结构化问题做最小修改，超过最大轮次后转人工处理。

## 3. 数据分层

### Foreshadowing

定义“这条伏笔是什么”：

- `truth`：作者层面的完整真相。
- `hidden_information`：揭示前禁止直接暴露的信息。
- `purpose`：伏笔对主线、人物或主题的作用。
- `importance`：`core` 或 `supporting`。
- `reveal_pattern`：渐进、延迟、误导、分层等抽象策略，不包含具体卷号。
- `status`：`planned / active / revealed / paid_off / abandoned`。

### ForeshadowingPlacement

定义“这条伏笔在何处、以何种边界发挥什么作用”：

- 必须绑定分卷，章节可以稍后再绑定。
- `position` 表示同一伏笔的生命周期顺序。
- `placement_type`：`seed / reinforce / misdirect / reveal / payoff / echo`。
- `narrative_intent`：本次安放的叙事目的。
- `allowed_information`：本次允许读者和人物获得的信息。
- `forbidden_information`：本次仍禁止暴露的信息。
- `required`：是否为不可省略的生命周期节点。
- `status`：`planned / assigned / written / verified / cancelled`。

### ForeshadowingOccurrence

记录正文实际出现的动作和证据。Placement 是计划，Occurrence 是事实；一个 Placement 可以对应多个 Occurrence。

## 4. 第一阶段规则

1. 核心伏笔至少包含 `seed` 和 `payoff`，且 Placement 必须跨越至少两个分卷。
2. 同一伏笔的 Placement 使用唯一递增 `position`。
3. `chapter_id` 所属章节必须属于 Placement 的 `volume_id`。
4. `verified` Placement 必须存在正文 Occurrence 证据。
5. 规划未绑定到分卷前只保存在联合规划草案中，不写入正式 Placement。
6. FinalPlan 接受时，应在同一事务内保存分卷、伏笔和 Placement。

## 5. 联合规划任务（已完成基础闭环）

- 使用 `story.structure.coordinate` 创建持久化任务，由独立 Worker 执行。
- VolumePlanner 与 ForeshadowPlanner 使用同一份 StoryContext 独立生成草案。
- NarrativeCoordinator 只通过稳定的 `volumeKey` 与 `foreshadowingKey` 建立 Placement。
- NarrativeCoordinator 使用裁剪后的故事核心、人物弧、故事线摘要和硬规则摘要，不再接收完整人物档案、故事线节点、数据库元数据或总纲中的旧分卷。
- Placement 按伏笔逐条规划；每完成一条即持久化 `coordinatorProgress`，失败后从尚未完成的伏笔继续。
- 模型校验与服务端确定性校验同时执行；核心伏笔必须跨卷并具有 `seed`、`payoff`。
- 校验问题按 `foreshadowingKey` 分组，每次只修订一条伏笔及其 Placement，避免单次输出过长。
- 某条伏笔修订失败时标记为人工复核，继续处理其他伏笔，不阻断 FinalPlan 输出。
- FinalPlan 在页面预览；即使存在人工复核项也可写入。无效 Placement 会被跳过，伏笔本体保留，用户可在故事管理中编辑或删除。

当前不自动绑定具体章节。章节级 Placement 将在卷规划稳定后，由章节规划器继续细化。
# 滚动规划 v2

长篇小说不再一次性生成全书所有分卷和所有伏笔落点。系统以 Planning Cycle 为单位滚动向前：

1. 固定全书锚点：核心创意、主题、核心冲突、主角成长方向、结局方向和禁止事项。
2. 读取最新故事状态快照，只把已发生事实与已确认承诺作为硬输入。
3. 详细规划当前 Story Arc、当前卷和最近章节窗口。
4. 为下一卷生成低置信度预览；更远阶段仅保存候选方向。
5. 伏笔只在当前卷与预备卷绑定 Placement。核心伏笔可以声明目标兑现阶段，但不提前虚构远期卷号。
6. 接受后替换旧 Planning Cycle；下一轮根据已完成正文和状态变化重新计算。

数据层以 `planning_cycles.output_summary` 保存完整的最新周期输出，以 `story_arcs`、`volumes`、`foreshadowings` 和 `foreshadowing_placements` 保存可查询的正式结构。旧版 `story.structure.coordinate` 输出不再兼容。
