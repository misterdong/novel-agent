# Novel Agent · 墨境

面向中文长篇小说创作的 AI 智能体工作台。系统以“用户主编、AI 协作”为核心模式，提供故事总纲、滚动分卷规划、故事线、人物与关系、伏笔、章节创作、长期记忆和一致性检查等能力。

> 当前项目处于持续开发阶段，数据结构可能继续调整。建议在升级前备份本地 PostgreSQL 数据。

## 主要功能

- 小说项目与章节管理
- 故事总纲、分卷、故事线、关键事件和章节卡
- 长篇滚动规划：当前故事阶段、当前卷、下一卷预览及近期章节窗口
- 故事圣经：人物卡、人物关系、世界规则、地点、阵营、能力和剧情道具
- 伏笔生命周期与分卷/章节 Placement
- AI 正文续写、自动章节创作和有限次数自动修复
- 正文不可变版本记录与历史恢复
- 章节摘要、时间线、人物认知、关系及道具状态提取
- 一致性与剧情质量检查
- 独立的提示词和模型响应日志

## 技术栈

- Next.js 16、React 19、TypeScript
- PostgreSQL 16、pgvector
- Drizzle ORM / Drizzle Kit
- Docker Compose
- OpenAI-compatible Chat Completions API

## 运行要求

- Node.js 22.13 或更高版本
- npm
- Docker Desktop 或兼容的 Docker 环境

## 本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 创建本地配置

```bash
cp .env.example .env
```

`.env` 已被 Git 忽略。不要将真实 API Key、数据库生产密码或私有模型地址写入 `.env.example`。

### 3. 启动 PostgreSQL

```bash
docker compose up -d postgres
```

检查容器状态：

```bash
docker compose ps
```

### 4. 执行数据库迁移

```bash
npm run db:migrate
```

如需写入本地演示数据：

```bash
npm run db:seed
```

### 5. 启动 Web 服务

```bash
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。

### 6. 启动 AI Worker

另开一个终端运行：

```bash
npm run worker:ai
```

AI 生成任务通过数据库队列执行。只启动 Web 服务而未启动 Worker 时，任务会停留在“等待 Worker”状态。

## 接入大模型

项目支持 OpenAI-compatible Chat Completions API。在 `.env` 中配置：

```dotenv
AI_PROVIDER=openai-compatible
AI_MODEL=your-model-name
OPENAI_API_KEY=
OPENAI_BASE_URL=https://your-provider.example/v1
```

修改 `.env` 后需要重启 Web 服务和 AI Worker。

如果只想验证页面和本地业务流程，可以保留：

```dotenv
AI_PROVIDER=mock
AI_MODEL=mock
OPENAI_API_KEY=
```

## AI 日志

默认提示词日志位置：

```text
logs/ai-prompts.log
```

模型响应日志默认关闭。按任务记录：

```dotenv
AI_RESPONSE_LOG_TASKS=story.rolling.plan,review.continuity
```

记录全部任务：

```dotenv
AI_RESPONSE_LOG_TASKS=*
```

日志目录已被 Git 忽略。提示词和模型响应可能包含小说正文与项目设定，请勿公开上传。

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 生产构建
npm run start        # 启动生产服务器
npm run lint         # 代码检查
npm run worker:ai    # 启动 AI Worker
npm run db:generate  # 根据 Schema 生成迁移
npm run db:migrate   # 执行迁移
npm run db:seed      # 写入演示数据
```

## 目录结构

```text
app/                  Next.js 页面与 API
components/           前端工作台组件
db/                   Drizzle Schema、数据库连接与种子数据
drizzle/              数据库迁移
lib/ai/               Provider、AI 工作流与提示词
workers/              后台生成任务 Worker
docs/                 产品、交互、数据库与任务协议文档
docker/               PostgreSQL 初始化脚本
```

## 数据与安全

- 章节正文保存在 `manuscript_versions`，每次保存或 AI 改写都会创建新版本。
- 本地 PostgreSQL 数据保存在 Docker named volume 中，不会进入 Git。
- `.env`、`.env.*`、运行日志、构建产物和依赖目录不会提交。
- `.env.example` 只包含本地开发默认值和空白密钥。
- 发布前建议再次运行密钥扫描，并检查 Git 暂存区。

## 产品与架构文档

- [产品需求](docs/product-requirements.md)
- [页面与交互设计](docs/ui-interaction-spec.md)
- [数据库结构](docs/database-schema.md)
- [AI 任务协议](docs/ai-task-protocols.md)
- [长篇滚动规划与伏笔](docs/volume-foreshadowing-planning.md)
- [开发进度](docs/development-progress.md)

## 当前限制

- 目前主要面向本地单用户使用。
- 自动创作仍应由作者检查事实、人物行为和故事节点推进。
- 故事线节点的自动完成闭环尚未完全实现。
- 不建议在没有人工复核和备份的情况下进行无人值守的超长连续生成。
