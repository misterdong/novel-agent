# 数据库 Schema 设计

- 文档版本：V1.0
- 推荐数据库：PostgreSQL + pgvector
- 设计原则：结构化事实为准、正文版本不可变、AI 写入可审计、删除默认软删除

## 1. 通用约定

- 主键统一使用 `uuid`。
- 时间使用 `timestamptz`，故事内时间使用独立字段表达。
- 所有项目级表必须包含 `project_id` 并在服务层做租户隔离。
- 可编辑实体包含 `created_at`、`updated_at`、`created_by`。
- 需要软删除的实体包含 `deleted_at`。
- 灵活但需验证的 AI 结构使用 `jsonb`；核心查询字段必须独立建列。
- 正文版本、生成记录和状态变更采用追加写入，避免覆盖审计历史。

## 2. 枚举建议

```sql
project_status      = active | archived | trashed
chapter_status      = draft | confirmed | writing | completed
scene_status        = draft | confirmed | writing | completed
entry_strength      = soft | hard
proposal_status     = pending | accepted | rejected | superseded
issue_severity      = error | warning | suggestion
issue_status        = open | fixed | ignored | false_positive
generation_status   = queued | running | completed | failed | cancelled
foreshadowing_state = planned | planted | reinforced | misdirected | resolved | abandoned
knowledge_state     = knows | believes | suspects | does_not_know
```

## 3. 身份与项目

### users

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 用户 ID |
| email | citext unique | 登录邮箱 |
| display_name | varchar(100) | 显示名 |
| created_at | timestamptz | 创建时间 |

### projects

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 项目 ID |
| owner_id | uuid FK users | 所有者 |
| title | varchar(200) | 小说名称 |
| genre | varchar(100) | 类型 |
| status | project_status | 状态 |
| target_words | integer | 目标字数 |
| target_chapters | integer | 目标章节 |
| chapter_word_target | integer | 单章目标字数 |
| narrative_pov | varchar(50) | 叙事视角 |
| audience | varchar(200) | 目标读者 |
| content_rating | varchar(50) | 内容尺度 |
| creation_mode | varchar(30) | guided/quick/blank |
| settings | jsonb | 其他偏好 |
| created_at / updated_at / deleted_at | timestamptz | 生命周期 |

索引：`(owner_id, status, updated_at desc)`。

## 4. 故事圣经

### story_bible_entries

统一保存世界规则、地点、势力、物品、能力、主题和风格等条目。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 条目 ID |
| project_id | uuid FK | 项目 |
| entry_type | varchar(40) | rule/location/faction/item/ability/style 等 |
| name | varchar(200) | 名称 |
| summary | text | 简述 |
| content | jsonb | 类型相关结构 |
| strength | entry_strength | 软/硬约束 |
| status | varchar(20) | draft/active/retired |
| source_type | varchar(30) | user/ai/import/chapter |
| source_id | uuid nullable | 来源对象 |
| version | integer | 乐观版本号 |
| created_at / updated_at / deleted_at | timestamptz | 生命周期 |

唯一约束建议：活动条目的 `(project_id, entry_type, lower(name))`。

### characters

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 人物 ID |
| project_id | uuid FK | 项目 |
| name | varchar(120) | 姓名 |
| aliases | text[] | 别名 |
| profile | jsonb | 年龄、外貌、身份、语言习惯等 |
| core_desire | text | 核心欲望 |
| external_goal | text | 外部目标 |
| internal_need | text | 内部需求 |
| fears_weaknesses | jsonb | 恐惧与弱点 |
| arc | jsonb | 人物弧光 |
| behavior_constraints | text[] | 行为硬约束 |
| version | integer | 乐观版本号 |
| created_at / updated_at / deleted_at | timestamptz | 生命周期 |

### entity_links

统一保存人物、设定、章节、伏笔等对象之间的显式关联。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 关联 ID |
| project_id | uuid FK | 项目 |
| source_type / source_id | varchar + uuid | 来源对象 |
| target_type / target_id | varchar + uuid | 目标对象 |
| relation_type | varchar(50) | appears_in/owns/member_of/related_to 等 |
| metadata | jsonb | 补充信息 |

索引：`(project_id, source_type, source_id)` 与 `(project_id, target_type, target_id)`。

## 5. 结构规划

### plot_lines

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 情节线 |
| project_id | uuid FK | 项目 |
| parent_id | uuid nullable | 嵌套情节线 |
| line_type | varchar(30) | main/subplot/character_arc |
| title | varchar(200) | 名称 |
| objective | text | 目标 |
| status | varchar(30) | 状态 |
| content | jsonb | 节点与约束 |

### volumes

字段：`id`、`project_id`、`title`、`position`、`objective`、`conflict`、`turning_points jsonb`、`end_state jsonb`、`status`、时间戳。

### chapters

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 章节 |
| project_id / volume_id | uuid FK | 所属项目与卷 |
| position | numeric(12,4) | 可重排位置 |
| title | varchar(200) | 标题 |
| status | chapter_status | 状态 |
| pov_character_id | uuid nullable | 视角人物 |
| outline | jsonb | 章节卡完整结构 |
| target_words / current_words | integer | 字数 |
| active_manuscript_version_id | uuid nullable | 当前正文版本 |
| confirmed_at | timestamptz nullable | 确认时间 |
| created_at / updated_at / deleted_at | timestamptz | 生命周期 |

索引：`(volume_id, position)`、`(project_id, status)`。

### storylines

字段：`id`、`project_id`、`name`、`storyline_type`、`summary`、`status`、`position`、时间戳。用于管理主线、谜团线、人物线、关系线和反派线等并行故事结构。

### plot_events

字段：`id`、`project_id`、`storyline_id`、`volume_id`、`chapter_id`、`title`、`description`、`cause`、`consequence`、`position`、时间戳。事件通过原因和后果形成因果链，并可关联故事线、分卷和章节。

### scenes

字段：`id`、`project_id`、`chapter_id`、`position numeric(12,4)`、`title`、`status`、`pov_character_id`、`outline jsonb`、`target_words`、`locked_at`、时间戳。

## 6. 正文与版本

### manuscript_versions

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 版本 ID |
| project_id / chapter_id | uuid FK | 范围 |
| parent_version_id | uuid nullable | 父版本 |
| version_no | integer | 章内版本号 |
| title | varchar(200) nullable | 人工命名 |
| content | text | 正文快照 |
| content_hash | char(64) | 去重/冲突判断 |
| word_count | integer | 字数 |
| source_type | varchar(30) | user/ai/rewrite/restore/autosave |
| generation_run_id | uuid nullable | AI 来源 |
| created_by | uuid FK | 创建者 |
| created_at | timestamptz | 创建时间 |

唯一约束：`(chapter_id, version_no)`；正文版本不执行 update/delete。

### locked_text_ranges

保存用户锁定区块。字段：`id`、`chapter_id`、`manuscript_version_id`、`start_anchor jsonb`、`end_anchor jsonb`、`content_hash`、`created_by`、`created_at`。编辑器锚点应使用文档模型位置，不依赖纯字符偏移。

## 7. 故事状态与认知

### story_facts

当前有效的客观事实。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 事实 |
| project_id | uuid FK | 项目 |
| subject_type / subject_id | varchar + uuid | 主体 |
| predicate | varchar(80) | 关系/属性，如 located_at |
| object_type / object_id | varchar + uuid nullable | 对象引用 |
| value | jsonb nullable | 标量或复杂值 |
| valid_from_event_id / valid_to_event_id | uuid nullable | 有效区间 |
| certainty | numeric(4,3) | 置信度 |
| source_chapter_id / source_version_id | uuid FK | 正文依据 |
| status | varchar(20) | active/superseded/disputed |
| created_at | timestamptz | 创建时间 |

部分唯一索引：活动单值事实的 `(project_id, subject_type, subject_id, predicate)`；允许多值的谓词由服务层配置。

### character_knowledge

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 认知记录 |
| project_id / character_id | uuid FK | 项目与人物 |
| fact_id | uuid nullable FK | 关联客观事实 |
| proposition | jsonb | 角色认为的内容 |
| state | knowledge_state | 知道/相信/怀疑/不知道 |
| learned_event_id | uuid nullable | 获知事件 |
| source_chapter_id | uuid nullable | 来源章节 |
| active | boolean | 当前是否有效 |

### relationships

字段：`id`、`project_id`、`from_character_id`、`to_character_id`、`relation_type`、`state jsonb`、`valid_from_event_id`、`valid_to_event_id`、`source_chapter_id`。关系为有向记录，双向关系由两条记录或服务层聚合表达。

### state_change_proposals

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 提案 |
| project_id / chapter_id | uuid FK | 范围 |
| manuscript_version_id | uuid FK | 提取依据 |
| proposal_type | varchar(40) | fact/knowledge/relation/item/ability 等 |
| target_type / target_id | varchar + uuid nullable | 目标 |
| old_value / new_value | jsonb | 前后值 |
| evidence | jsonb | 原文位置和片段 |
| conflict | jsonb nullable | 冲突信息 |
| status | proposal_status | 审批状态 |
| reviewed_by / reviewed_at | uuid + timestamptz | 审批信息 |

只有 accepted 提案才能在事务内更新正式事实表。

## 8. 时间线与伏笔

### timeline_events

字段：`id`、`project_id`、`chapter_id`、`scene_id`、`title`、`description`、`time_kind`、`absolute_time`、`relative_day`、`relative_to_event_id`、`relative_offset`、`duration`、`location_id`、`position_confidence`、`source_version_id`、时间戳。

`time_kind` 支持 `absolute`、`relative_day`、`relative_event`、`unknown`。

### event_participants

字段：`event_id`、`character_id`、`role`、`state_before jsonb`、`state_after jsonb`；复合主键 `(event_id, character_id)`。

### foreshadowings

字段：`id`、`project_id`、`title`、`description`、`foreshadowing_type`、`state`、`importance`、`planned_resolution_chapter_id`、`actual_resolution_chapter_id`、时间戳。

### foreshadowing_occurrences

字段：`id`、`foreshadowing_id`、`chapter_id`、`scene_id`、`action`、`description`、`source_version_id`、`evidence jsonb`；`action` 为 planted/reinforced/misdirected/resolved。

## 9. 摘要、记忆与检索

### chapter_summaries

字段：`id`、`project_id`、`chapter_id`、`manuscript_version_id`、`short_summary`、`detailed_summary`、`character_changes jsonb`、`commitments jsonb`、`open_questions jsonb`、`created_at`。

### memory_items

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 记忆片段 |
| project_id | uuid FK | 项目 |
| source_type / source_id | varchar + uuid | 来源 |
| memory_type | varchar(30) | summary/event/dialogue/fact 等 |
| content | text | 可检索文本 |
| metadata | jsonb | 人物、地点、章节、重要度等 |
| embedding | vector | 向量 |
| embedding_model | varchar(100) | 模型版本 |
| created_at | timestamptz | 创建时间 |

索引：`project_id`、metadata 的 GIN、content 的全文索引、embedding 的 HNSW/IVFFlat。向量维度由模型适配层配置，不在迁移中硬编码多个模型共用。

## 10. AI 任务与审校

### generation_runs

字段：`id`、`project_id`、`chapter_id`、`scene_id`、`task_type`、`status`、`model_provider`、`model_name`、`prompt_version`、`parameters jsonb`、`user_instruction`、`input_manifest jsonb`、`raw_output`、`parsed_output jsonb`、`input_tokens`、`output_tokens`、`estimated_cost`、`latency_ms`、`error_code`、`error_message_safe`、`baseline_version_id`、`accepted_at`、`accepted_character_count`、时间戳。

`input_manifest` 只保存上下文对象 ID、版本和摘要哈希；敏感正文不重复复制到日志字段。

### review_issues

字段：`id`、`project_id`、`chapter_id`、`manuscript_version_id`、`review_type`、`severity`、`status`、`code`、`title`、`explanation`、`location jsonb`、`evidence jsonb`、`suggestions jsonb`、`confidence`、`generation_run_id`、`resolved_version_id`、`ignored_reason`、时间戳。

### prompt_templates

字段：`id`、`task_type`、`version`、`system_template`、`input_schema jsonb`、`output_schema jsonb`、`status`、`created_at`。生产任务引用不可变版本。

## 11. 事务边界

### 接受 AI 正文

1. 校验 `baseline_version_id` 仍是当前版本。
2. 创建新的 `manuscript_versions`。
3. 更新 `chapters.active_manuscript_version_id`。
4. 更新 `generation_runs.accepted_at` 和采纳字符数。
5. 提交事务后异步触发检查与状态提取。

### 接受状态提案

1. 锁定待审批提案。
2. 再次校验旧值和冲突状态。
3. 将旧事实标记 superseded 或创建新事实/认知/关系。
4. 更新提案为 accepted，并记录审批人和时间。
5. 同一事务提交。

## 12. 分卷与伏笔联合规划

### foreshadowings

字段：`id`、`project_id`、`title`、`truth`、`hidden_information jsonb`、`purpose`、`importance`、`reveal_pattern`、`status`、时间戳。

- `importance`：`core / supporting`。
- `status`：`planned / active / revealed / paid_off / abandoned`。
- `reveal_pattern` 只描述抽象揭示策略，不记录具体卷号。

### foreshadowing_placements

字段：`id`、`project_id`、`foreshadowing_id`、`volume_id`、`chapter_id`、`position`、`placement_type`、`required`、`narrative_intent`、`allowed_information jsonb`、`forbidden_information jsonb`、`status`、时间戳。

- `placement_type`：`seed / reinforce / misdirect / reveal / payoff / echo`。
- `status`：`planned / assigned / written / verified / cancelled`。
- 唯一约束：`foreshadowing_id + position`。

### foreshadowing_occurrences

正文事实层，在现有字段基础上增加可空 `placement_id`。Placement 表示计划，Occurrence 表示正文中实际发生的动作和证据。

完整流程见[分卷与伏笔联合规划](./volume-foreshadowing-planning.md)。

## 13. 数据保留与删除

- 项目删除先更新为 trashed，并设置 `deleted_at`。
- 到期后异步硬删除项目正文、记忆向量和 AI 衍生数据。
- 审计与计费记录如需依法保留，只保存最小化元数据，不保存正文。
- 导出任务使用短期对象存储 URL，到期后自动清理。
