# AI 任务输入输出协议

- 文档版本：V1.0
- 目标：统一各 AI 任务的上下文、结构化输出、错误处理和审计方式

## 1. 协议原则

1. 工作流编排器负责状态，模型不直接读写数据库。
2. 输入传递必要上下文及稳定 ID，避免整本正文进入上下文。
3. 除正文内容外，任务输出必须符合版本化 JSON Schema。
4. 模型输出是提案，不是正式事实；写库前由服务校验并按规则审批。
5. 每次任务记录提示词版本、输入清单、模型、参数、耗时、Token 和结果。
6. 正文任务也使用 JSON 信封，正文放在字符串字段内，以便传递元数据。

### 1.1 指定任务的模型响应日志

`requestChat()` 支持按任务白名单记录模型原始返回值，默认关闭：

```env
AI_RESPONSE_LOG_TASKS=story.narrative.coordinate,story.structure.validate
AI_RESPONSE_LOG_FILE=logs/ai-responses.log
AI_RESPONSE_LOG_STDOUT=false
```

- 多个任务用逗号分隔；`*` 表示记录全部任务。
- 配置基础任务名时，其 `.retry` 调用也会被记录。
- 日志包含任务、Provider、模型、HTTP 状态、耗时、`finish_reason`、Token usage 和原始响应文本，不包含 API Key。
- 响应日志写入失败只报告系统错误，不影响正常模型结果。

## 2. 通用任务信封

### 2.1 请求

```json
{
  "protocol_version": "1.0",
  "request_id": "uuid",
  "task_type": "chapter.write",
  "project_id": "uuid",
  "scope": {
    "volume_id": "uuid",
    "chapter_id": "uuid",
    "scene_id": "uuid"
  },
  "locale": "zh-CN",
  "user_instruction": "增强压迫感，但不要提前揭露凶手",
  "constraints": {
    "must_include": [],
    "must_avoid": [],
    "locked_fact_ids": [],
    "locked_text_hashes": []
  },
  "context": {},
  "generation_options": {
    "target_words": 1800,
    "pace": "balanced",
    "dialogue_ratio": 0.35,
    "stream": true
  }
}
```

### 2.2 成功响应

```json
{
  "protocol_version": "1.0",
  "request_id": "uuid",
  "task_type": "chapter.write",
  "status": "success",
  "result": {},
  "warnings": [],
  "usage": {
    "input_tokens": 0,
    "output_tokens": 0
  }
}
```

### 2.3 失败响应

```json
{
  "protocol_version": "1.0",
  "request_id": "uuid",
  "task_type": "chapter.write",
  "status": "error",
  "error": {
    "code": "CONTEXT_CONFLICT",
    "message": "章节要求与锁定设定冲突",
    "retryable": false,
    "details": {
      "conflicting_ids": ["uuid"]
    }
  }
}
```

## 3. 通用上下文结构

```json
{
  "project_brief": {
    "genre": "悬疑",
    "audience": "成年读者",
    "narrative_pov": "第三人称限知",
    "tone": ["克制", "压迫"]
  },
  "hard_rules": [
    {"id": "uuid", "name": "能力限制", "content": "...", "version": 3}
  ],
  "characters": [
    {
      "id": "uuid",
      "name": "林默",
      "stable_profile": {},
      "current_state": {},
      "knowledge": [],
      "speech_traits": []
    }
  ],
  "chapter_plan": {},
  "scene_plan": {},
  "recent_summaries": [],
  "retrieved_memories": [
    {
      "id": "uuid",
      "type": "event",
      "content": "...",
      "source": {"chapter_id": "uuid", "version_id": "uuid"},
      "relevance": 0.92
    }
  ],
  "previous_ending": "...",
  "foreshadowings": [],
  "style_profile": {}
}
```

编排器按任务裁剪字段；模型不得推断缺失字段一定不存在。

## 4. 任务目录

| task_type | 用途 | 主要输出 |
|---|---|---|
| ideation.interview_next | 生成下一轮访谈问题 | questions |
| ideation.propose | 生成故事候选方案 | proposals |
| bible.generate | 生成故事圣经草案 | entries/characters |
| outline.story | 生成或修改总纲 | story_outline |
| outline.volume | 生成分卷 | volumes |
| outline.chapter | 生成章节卡 | chapters |
| outline.scene | 生成场景卡 | scenes |
| chapter.write | 生成正文 | prose |
| chapter.continue | 从光标续写 | prose |
| text.rewrite | 选区改写 | replacement |
| review.continuity | 一致性检查 | issues |
| review.plot | 剧情检查 | issues |
| review.style | 文本质量检查 | issues |
| memory.summarize | 章节摘要 | summaries |
| memory.extract_changes | 状态变化提取 | proposals |
| memory.resolve_conflict | 冲突解决建议 | resolutions |
| story.structure.coordinate | 联合规划分卷与伏笔 | FinalPlan |

### story.structure.coordinate

Worker 按以下阶段执行并将阶段写入 `generation_runs.input_manifest`：

```text
volume_planned → foreshadowing_planned → coordinated → final_plan
```

最终输出：

```json
{
  "volumes": [{"volumeKey": "volume_1", "title": "..."}],
  "foreshadowings": [{"key": "identity_truth", "importance": "core"}],
  "placements": [
    {
      "foreshadowingKey": "identity_truth",
      "volumeKey": "volume_1",
      "position": 1,
      "placementType": "seed",
      "required": true,
      "narrativeIntent": "...",
      "allowedInformation": {"reader": []},
      "forbiddenInformation": {"reader": []}
    }
  ],
  "validation": {"passed": true, "issues": [], "summary": "..."},
  "revisionHistory": []
}
```

稳定 key 只在草案内部建立关联，接受 FinalPlan 时才映射为正式数据库 UUID。校验失败允许一次最小修订；第二次仍失败时保留输出供诊断，但接口拒绝接受。

## 5. 创意访谈协议

### ideation.interview_next

输入附加字段：

```json
{
  "context": {
    "confirmed_answers": {},
    "uncertain_topics": [],
    "conversation_summary": "..."
  }
}
```

输出：

```json
{
  "questions": [
    {
      "id": "q_core_conflict",
      "topic": "core_conflict",
      "question": "主角最大的外部阻力来自谁？",
      "why_needed": "决定主要对抗结构",
      "choices": [
        {"id": "c1", "label": "医院管理层", "implication": "制度性冲突"}
      ],
      "allow_uncertain": true
    }
  ],
  "coverage": {
    "completed_topics": [],
    "missing_topics": [],
    "ready_to_propose": false
  }
}
```

校验：问题数 1—3；不得重复 `confirmed_answers` 已回答主题。

### ideation.propose

```json
{
  "proposals": [
    {
      "id": "proposal_1",
      "title": "寿命盲区",
      "logline": "...",
      "core_conflict": "...",
      "selling_points": ["..."],
      "protagonist_arc": "...",
      "ending_direction": "...",
      "risks": ["能力规则可能削弱推理公平性"],
      "recommendation_reason": "..."
    }
  ]
}
```

校验：默认输出 3 个明显不同的方案；每个方案不得引入用户禁止内容。

## 6. 故事圣经协议

### bible.generate 输出

```json
{
  "entries": [
    {
      "client_id": "entry_1",
      "entry_type": "rule",
      "name": "寿命视觉规则",
      "summary": "...",
      "content": {},
      "strength": "hard",
      "assumptions": ["..."],
      "source_answer_ids": ["q_1"]
    }
  ],
  "characters": [
    {
      "client_id": "character_1",
      "name": "...",
      "aliases": [],
      "profile": {},
      "core_desire": "...",
      "external_goal": "...",
      "internal_need": "...",
      "fears_weaknesses": [],
      "arc": {},
      "behavior_constraints": []
    }
  ],
  "open_questions": [],
  "potential_conflicts": []
}
```

AI 使用 `client_id` 建立同一响应内引用；服务入库后替换为 UUID。

## 7. 大纲协议

### outline.story

输出必须包含：开篇状态、触发事件、升级节点、中点、最低谷、高潮、结局、主角弧光、主线和支线。

```json
{
  "story_outline": {
    "premise": "...",
    "theme": "...",
    "opening_event": "打破原有秩序并启动故事的开篇事件",
    "opening_hook": "开篇向读者交付的异常、危机或阅读承诺",
    "initial_goal": "主角在故事前期可立即执行的目标",
    "core_payoff": "作品持续向读者兑现的核心满足",
    "long_term_mystery": "跨越多个阶段逐步揭晓的长期悬念",
    "opening_state": {},
    "inciting_incident": {},
    "major_beats": [
      {"id": "beat_1", "type": "midpoint", "event": "...", "consequence": "...", "locked": false}
    ],
    "climax": {},
    "ending_state": {},
    "character_arcs": [],
    "plot_lines": []
  },
  "assumptions": [],
  "warnings": []
}
```

修改任务额外传入 `locked_paths`；输出必须原样保留被锁定字段。

### outline.chapter

```json
{
  "chapters": [
    {
      "client_id": "chapter_01",
      "position": 1,
      "title": "...",
      "objective": "...",
      "pov_character_id": "uuid",
      "time": {},
      "location_ids": ["uuid"],
      "character_ids": ["uuid"],
      "opening_state": {},
      "core_conflict": "...",
      "key_events": [],
      "information_reveals": [],
      "emotional_shift": {"from": "...", "to": "..."},
      "outcome": "...",
      "ending_hook": "...",
      "foreshadowing_actions": [],
      "target_words": 3000,
      "dependencies": []
    }
  ],
  "continuity_warnings": []
}
```

### outline.scene

```json
{
  "scenes": [
    {
      "client_id": "scene_1",
      "position": 1,
      "objective": "...",
      "time": {},
      "location_id": "uuid",
      "pov_character_id": "uuid",
      "character_ids": ["uuid"],
      "conflict": "...",
      "actions": [],
      "emotional_beats": [],
      "new_information": [],
      "outcome": "...",
      "transition": "...",
      "target_words": 1000
    }
  ],
  "coverage": {
    "chapter_events_covered": [],
    "uncovered_events": []
  }
}
```

## 8. 正文生成协议

### chapter.write / chapter.continue

输入必须提供 `baseline_version_id` 和 `insertion_anchor`，防止并发覆盖。

```json
{
  "context": {
    "baseline_version_id": "uuid",
    "insertion_anchor": {"block_id": "p-18", "offset": 42},
    "existing_scene_text": "...",
    "remaining_scene_events": []
  }
}
```

非流式最终输出：

```json
{
  "prose": "生成的正文……",
  "placement": {
    "mode": "append_after_anchor",
    "anchor": {"block_id": "p-18", "offset": 42}
  },
  "covered_events": ["event_ref_1"],
  "introduced_facts": [
    {"statement": "林默拿到了钥匙", "temporary": true}
  ],
  "scene_goal_status": "completed",
  "stop_reason": "scene_complete",
  "self_warnings": []
}
```

流式事件：

```json
{"event":"generation.started","request_id":"uuid"}
{"event":"prose.delta","text":"走廊尽头"}
{"event":"prose.delta","text":"的灯闪了一下。"}
{"event":"generation.metadata","data":{"scene_goal_status":"completed"}}
{"event":"generation.completed","request_id":"uuid"}
```

服务端只在 `generation.completed` 后将完整候选稿保存为任务结果；用户接受后再创建正文版本。

## 9. 选区改写协议

### text.rewrite 输入

```json
{
  "context": {
    "baseline_version_id": "uuid",
    "selection": {
      "start_anchor": {"block_id": "p-4", "offset": 0},
      "end_anchor": {"block_id": "p-7", "offset": 18},
      "text": "原始选区……",
      "before": "前文窗口……",
      "after": "后文窗口……"
    },
    "rewrite_mode": "dialogue",
    "preserve": ["event_outcome", "facts", "pov"]
  }
}
```

输出：

```json
{
  "replacement": "改写文本……",
  "change_summary": ["减少解释性台词", "保持钥匙交付结果"],
  "preserved_checks": [
    {"item": "event_outcome", "passed": true}
  ],
  "possible_new_facts": []
}
```

服务端必须验证基线版本、选区原文哈希和锁定范围；不一致时返回 `BASELINE_CHANGED`。

## 10. 审校协议

### 通用问题结构

```json
{
  "issues": [
    {
      "client_id": "issue_1",
      "review_type": "continuity",
      "severity": "error",
      "code": "ABILITY_NOT_ACQUIRED",
      "title": "角色提前使用能力",
      "explanation": "该能力在第 14 章才获得",
      "location": {
        "start_anchor": {"block_id": "p-9", "offset": 3},
        "end_anchor": {"block_id": "p-9", "offset": 24},
        "quote": "..."
      },
      "evidence": [
        {"source_type": "story_fact", "source_id": "uuid", "summary": "..."}
      ],
      "suggestions": [
        {"action": "rewrite_current", "description": "改为使用普通观察判断", "replacement": "..."}
      ],
      "confidence": 0.96
    }
  ],
  "review_summary": {
    "error_count": 1,
    "warning_count": 0,
    "suggestion_count": 0
  }
}
```

规则：

- `error` 必须有明确事实依据。
- 没有依据但疑似异常的问题最高为 `warning`。
- 引用正文应最小化，只包含定位所需片段。
- 修复稿仍作为候选，不自动应用。

## 11. 摘要与状态提取协议

### memory.summarize

```json
{
  "short_summary": "不超过 100 个中文字符的摘要",
  "detailed_summary": "...",
  "key_events": [],
  "character_changes": [],
  "commitments": [],
  "open_questions": [],
  "foreshadowing_refs": []
}
```

### memory.extract_changes

```json
{
  "proposals": [
    {
      "client_id": "change_1",
      "proposal_type": "fact",
      "operation": "set",
      "target": {"type": "character", "id": "uuid"},
      "predicate": "located_at",
      "old_value": {"entity_id": "old-location"},
      "new_value": {"entity_id": "new-location"},
      "effective_event_ref": "event_2",
      "evidence": {
        "quote": "...",
        "start_anchor": {"block_id": "p-11", "offset": 0},
        "end_anchor": {"block_id": "p-11", "offset": 20}
      },
      "confidence": 0.94,
      "requires_review": true,
      "conflict": null
    }
  ],
  "timeline_events": [],
  "unresolved_references": []
}
```

所有提案默认 `requires_review: true`。即使置信度高，也不得由模型直接写入正式事实。

## 12. 冲突解决协议

### memory.resolve_conflict

输出固定提供适用选项，而不是替用户决定：

```json
{
  "conflict_summary": "新正文称角色在上海，但当前事实为北京",
  "options": [
    {
      "action": "keep_old",
      "effect": "保留北京，修改当前正文",
      "affected_ids": ["uuid"]
    },
    {
      "action": "accept_new",
      "effect": "创建从本章事件开始的位置变化",
      "required_explanation": "需确认旅程是否已在正文发生"
    },
    {
      "action": "character_mistake",
      "effect": "客观事实不变，将上海记录为角色误解"
    }
  ],
  "recommended_action": "accept_new",
  "recommendation_reason": "正文存在明确移动事件"
}
```

## 13. 错误码

| 错误码 | 可重试 | 说明 |
|---|---:|---|
| INVALID_INPUT | 否 | 请求未通过 Schema 校验 |
| MISSING_CONTEXT | 否 | 缺少任务必需上下文 |
| CONTEXT_CONFLICT | 否 | 上层约束互相冲突 |
| BASELINE_CHANGED | 否 | 正文基线发生变化，需要合并或重生成 |
| LOCKED_CONTENT_VIOLATION | 否 | 输出尝试修改锁定内容 |
| OUTPUT_SCHEMA_INVALID | 是 | 模型结构化输出不合法 |
| MODEL_TIMEOUT | 是 | 模型调用超时 |
| MODEL_RATE_LIMITED | 是 | 模型限流 |
| SAFETY_BLOCKED | 否 | 内容安全阻止生成 |
| CANCELLED_BY_USER | 否 | 用户主动取消 |

结构化输出失败只允许进行一次“保持语义、修复格式”的自动重试。

## 14. 提示词版本与评估

- 每个任务绑定不可变 `prompt_version`、`input_schema_version` 和 `output_schema_version`。
- 新版本先用固定测试集离线评估，再小流量发布。
- 评估至少包含 Schema 通过率、事实一致性、章节目标覆盖率、用户采纳率、平均修改量和成本。
- 线上回滚只切换任务版本，不修改历史 `generation_runs`。

## 15. 安全与日志

- 日志保存上下文对象 ID、版本和哈希，不重复保存整章正文。
- 安全错误信息对用户可解释，但不返回内部系统提示词。
- 模型供应商请求由统一适配层发送，密钥不得进入任务载荷。
- 用户作品默认不得进入训练或跨用户检索语料。
