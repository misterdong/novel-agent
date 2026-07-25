# Novel Agent 产品文档

本文档集描述面向中文长篇小说创作的 AI 智能体产品。核心模式是“AI 主笔/助手，用户主编”，通过结构化故事记忆、分层剧情规划和审校工作流支持持续创作。

## 文档目录

1. [产品需求文档](./product-requirements.md)
2. [页面与交互设计](./ui-interaction-spec.md)
3. [数据库 Schema 设计](./database-schema.md)
4. [AI 任务输入输出协议](./ai-task-protocols.md)
5. [开发进度](./development-progress.md)
6. [分卷与伏笔联合规划](./volume-foreshadowing-planning.md)

## 当前范围

- Web 端中文小说创作工作台
- 创意访谈、故事圣经、总纲/分卷/章节/场景规划
- 正文生成、续写、选区改写、版本管理
- 人物状态、时间线、伏笔和长期记忆
- 一致性、剧情和文本质量检查
- TXT、Markdown、DOCX 导出

暂不包含自动发布、社区、多人实时协作、自训练基础模型和无人值守的无限连载。

## 本地数据库

项目使用 Docker 中的 PostgreSQL 16 和 pgvector。复制 `.env.example` 为 `.env` 后运行：

```bash
docker compose up -d postgres
```

默认本地连接地址：

```text
postgresql://novel_agent:novel_agent_local@localhost:5432/novel_agent
```
