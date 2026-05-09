# Runtime-First 桌面智能体设计

状态：方向已确认，等待用户审阅
日期：2026-05-09
项目：灵枢 / Lingshu

## 背景

项目已经重置为空项目基线。旧的 CLI 架构和相关分支已经清理，因为旧内容会干扰这次重构。

新项目要做成真正的软件，而不是 CLI 的可视化外壳。它需要支持多模型、多供应商、配置文件读取 API key、软件内切换模型、未来多个智能体同时运行且模型可以不同，并且要给其他本地软件留下控制接口。

本设计的核心判断是：

> 先做本地 Agent Runtime。桌面 UI 是 Runtime 的官方客户端，而不是 Runtime 本身。

## 目标

1. 做一个不依赖底层 CLI 的桌面应用。
2. 把智能体编排放在本地 Runtime 服务中，并通过清晰 API 暴露能力。
3. 通过统一 Provider 抽象兼容不同模型供应商。
4. 使用 TOML 配置文件读取 API key 和模型配置，并兼容 Codex 风格配置。
5. 支持用户在软件内直接切换模型。
6. 为未来多智能体运行打好基础，每个智能体可以绑定不同模型档位。
7. 暴露本地控制接口，让其他软件可以创建会话、启动任务、观察进度、切换模型、取消任务。
8. 对密钥、外部控制、高风险工具调用建立明确安全边界。

## 非目标

1. 不重建旧的 CLI 架构。
2. 第一版不依赖 Claude Code、Codex CLI 或其他外部 CLI 作为核心执行引擎。
3. 第一阶段不实现完整多智能体并发。
4. 不把 MCP 当作内部 Runtime 协议。MCP 后续只作为外部兼容层。
5. 不把原始 API key 放进渲染进程或 UI 状态。
6. 默认不写回 `~/.codex/config.toml`。

## 推荐技术栈

- 桌面壳：Electron
- UI：React、TypeScript、Vite
- Runtime 服务：Node.js、TypeScript
- 包管理：pnpm workspace
- 共享契约：TypeScript 类型和 Zod schema
- 本地存储：SQLite，使用成熟 Node 包
- 本地控制接口：HTTP API 加 WebSocket 事件流
- 测试：Vitest 做单元和集成测试，Playwright 做桌面/UI 流程测试
- 打包：Electron Forge，具体打包方案保持可替换

第一版优先选择 Electron。它能让 UI、Runtime、模型适配器、本地 API 和测试都留在 TypeScript 生态里。Tauri 以后可以再评估，但 Rust 加 Node sidecar 会让早期复杂度偏高。

## 总体架构

产品分为四个执行区域：

```text
Desktop UI <-> Electron Main <-> Runtime Daemon <-> Workers / Providers / Tools
                  |
                  +-> OS integration

External Software <-> Local HTTP API / WebSocket <-> Runtime Daemon
```

### Desktop Renderer

Renderer 只负责用户界面：

- 会话和工作区视图
- 模型/profile 切换器
- 智能体状态面板
- 任务进度和事件时间线
- 设置页
- 权限和审批弹窗

Renderer 不直接调用模型 SDK，也不能接触原始密钥。

### Electron Main

Electron Main 只负责桌面壳：

- 创建窗口
- 管理托盘和应用生命周期
- 启动或重连 Runtime Daemon
- 处理深链和应用快捷键
- 暴露窄范围 preload bridge
- 协调桌面通知

Main 进程不放智能体编排逻辑，也不放模型供应商业务逻辑。

### Runtime Daemon

Runtime Daemon 是真正核心。它负责：

- 配置读取和校验
- Provider 注册表和模型目录
- Session、Task、Run、Agent 生命周期
- 模型 profile 解析
- 任务调度
- 取消机制
- 本地控制 API
- WebSocket 事件流
- 本地存储
- 权限检查
- 审计事件

第一版可以由 Electron 启动一个 daemon 子进程。后续可以演进为更长期运行的后台服务。

### Workers

Worker 在长任务或高风险工具需要隔离时引入。它负责：

- 单个智能体执行
- 长时间工具调用
- 可取消的模型流
- 按任务隔离资源

第一版不必须实现 Worker，但 Runtime 接口要给它预留空间。

## 模块布局

第一版代码使用小型 monorepo：

```text
apps/
  desktop/
    src/
      main/
      preload/
      renderer/
  daemon/
    src/
      bootstrap/
      control-api/
      modules/
        config/
        providers/
        models/
        sessions/
        tasks/
        agents/
        workflows/
        tools/
        permissions/
        storage/
        events/

packages/
  shared/
    src/
      schemas/
      contracts/
      events/
      errors/
      ids/

assets/
  workflow-packs/
    superpowers/

docs/
  architecture/
  decisions/
  superpowers/
    specs/
    plans/
```

模块职责：

- `config`：读取、合并、校验、监听配置文件。
- `providers`：适配 OpenAI、Anthropic、OpenRouter、Ollama 和 OpenAI-compatible API。
- `models`：维护模型描述、能力标签和模型目录策略。
- `sessions`：管理会话和工作上下文。
- `tasks`：管理排队、运行、完成、失败、取消等任务状态。
- `agents`：管理智能体实例和每个智能体的模型绑定。
- `workflows`：把 Superpowers 流程表示成数据和状态机。
- `tools`：在权限和超时约束下注册工具。
- `permissions`：认证客户端、检查 capability、创建审批请求。
- `storage`：管理 SQLite migration 和 repository。
- `events`：向 UI、日志和 WebSocket 订阅者发布领域事件。
- `control-api`：暴露本地 HTTP 和 WebSocket 端点。

## 核心领域模型

### Session

`Session` 表示一个工作上下文。

字段：

- `sessionId`
- `title`
- `workspaceId`
- `createdBy`
- `defaultModelProfileId`
- `state`：`active | paused | archived | completed`
- `policyRef`
- `metadata`
- `createdAt`
- `updatedAt`

一个 Session 可以包含多个 Task 和多个 Agent。

### Task

`Task` 是调度单位。

字段：

- `taskId`
- `sessionId`
- `parentTaskId`
- `kind`：`chat | plan | execute | tool_call | review | background_job`
- `input`
- `status`：`queued | running | waiting_approval | cancelling | cancelled | failed | completed`
- `priority`
- `requestedBy`
- `assignedAgentId`
- `modelProfileId`
- `resultRef`
- `createdAt`
- `startedAt`
- `endedAt`

Task 必须可取消、可重试、可观察、可持久化。

### AgentInstance

`AgentInstance` 表示 Session 中一个活跃智能体。

字段：

- `agentId`
- `sessionId`
- `role`：`primary | planner | coder | reviewer | tool_runner | observer`
- `state`：`idle | running | waiting_input | blocked | cancelling | cancelled | failed`
- `modelProfileId`
- `instructionProfileRef`
- `capabilityProfileRef`
- `currentTaskId`
- `parentAgentId`
- `createdAt`
- `lastHeartbeatAt`

这个对象是未来多智能体执行的基础。

### ModelBinding

模型选择不是全局唯一，而是分层绑定。

优先级：

```text
task > agent > session > global
```

字段：

- `bindingId`
- `scopeType`：`global | session | agent | task`
- `scopeId`
- `providerId`
- `model`
- `parameters`
- `fallbackChain`
- `reason`

用户在 UI 中切换模型时，只影响新任务。已经运行的任务继续使用启动时的配置快照。

### Event

Runtime 输出追加式领域事件。

关键事件类型：

- `session.created`
- `user.message_added`
- `assistant.message_delta`
- `task.created`
- `task.queued`
- `task.started`
- `task.progress`
- `task.output.delta`
- `task.completed`
- `task.failed`
- `task.cancel_requested`
- `task.cancelled`
- `agent.spawned`
- `agent.state_changed`
- `model.switched`
- `tool.called`
- `tool.completed`
- `tool.failed`
- `approval.requested`
- `approval.resolved`
- `runtime.warning`
- `runtime.error`

UI 和外部客户端通过快照加事件重建可见状态。

## Provider 和模型设计

Provider 层使用五个核心对象：

- `ProviderKind`：`openai | anthropic | openrouter | ollama | openai-compatible`
- `ProviderInstance`：一个具名 Provider 配置，包含 base URL、auth 配置、headers 和 catalog 策略
- `ModelProfile`：面向用户的模型档位，例如 `fast`、`deep`、`local`
- `AgentBinding`：从 agent role 或 agent id 到 model profile 的映射
- `ProviderAdapter`：把 Runtime 统一请求转换为各供应商 API 请求

统一请求字段：

- `messages`
- `systemPrompt`
- `tools`
- `attachments`
- `temperature`
- `maxOutputTokens`
- `responseFormat`
- `reasoning`
- `stream`

统一流事件：

- `text-delta`
- `tool-call`
- `usage`
- `done`
- `error`

模型能力必须显式标记：

- `supportsStreaming`
- `supportsTools`
- `supportsVision`
- `supportsJson`
- `supportsReasoning`
- `supportsSystemPrompt`
- `supportsLocalExecution`

OpenRouter 单独作为一种 ProviderKind，即使它内部可以复用 OpenAI-compatible 传输代码。Ollama 也单独作为一种 ProviderKind，因为本地发现、鉴权和 HTTP 行为都不同于云端供应商。

## 配置和 API Key

配置格式使用 TOML。

配置文件位置：

```text
用户应用配置：
%USERPROFILE%\.lingshu\config.toml

用户应用密钥：
%USERPROFILE%\.lingshu\secrets.toml

Codex 兼容读取：
%USERPROFILE%\.codex\config.toml

工作区共享配置：
<workspace>\.lingshu.toml

工作区本地覆盖：
<workspace>\.lingshu.local.toml
```

配置合并优先级：

```text
runtime override > workspace local > workspace shared > user app config > Codex compatibility read > built-in defaults
```

合并规则：

- 数组整体替换。
- `auth` 块整体替换。
- providers、profiles、agents 按 key 合并。
- 允许 profile 继承。
- 第一版不允许 provider 继承。

示例：

```toml
version = 1

[app]
default_profile = "fast"

[trust]
allow_workspace_providers = false
allow_insecure_http_hosts = ["127.0.0.1:11434", "localhost:11434"]

[providers.openai_main]
type = "openai"
base_url = "https://api.openai.com/v1"
auth = { source = "env", env = "OPENAI_API_KEY" }
catalog = { source = "hybrid" }

[providers.openrouter_main]
type = "openrouter"
base_url = "https://openrouter.ai/api/v1"
auth = { source = "env", env = "OPENROUTER_API_KEY" }
catalog = { source = "hybrid" }

[providers.ollama_local]
type = "ollama"
base_url = "http://127.0.0.1:11434"
auth = { source = "none" }
catalog = { source = "remote" }

[profiles.fast]
provider = "openrouter_main"
model = "example-fast-model"
temperature = 0.2
max_output_tokens = 8000

[profiles.deep]
provider = "openai_main"
model = "example-deep-model"
temperature = 0.1
max_output_tokens = 16000

[profiles.local]
provider = "ollama_local"
model = "example-local-model"

[agents.default]
profile = "fast"

[agents.planner]
profile = "deep"

[agents.coder]
profile = "fast"

[agents.reviewer]
profile = "deep"
```

密钥文件示例：

```toml
[secrets]
anthropic_api_key = "..."
company_llm_key = "..."
```

支持的 auth source：

- `runtime_secret`：用户在 UI 中临时输入，只保存在内存。
- `secret_ref`：从应用 secrets 文件读取。
- `env`：从指定环境变量读取。
- `inline`：只允许出现在用户级配置。
- `none`：用于 Ollama 这类本地无鉴权 Provider。

如果配置指定的 auth source 读取失败，Runtime 必须给出明确错误。不要静默回退到其他密钥来源。

安全边界：

- 原始密钥只留在 daemon 进程。
- Renderer 只能拿到脱敏后的 Provider 摘要。
- 工作区共享配置默认不可信。
- 自定义远程 base URL 默认必须使用 HTTPS；localhost 或明确白名单可以例外。
- 未知 host 如果会接收凭证，必须先让用户确认信任。
- 日志、崩溃报告、诊断导出必须脱敏。
- ProviderAdapter 只能接收已解析的 auth 数据，不能直接读 env 或文件。

## 外部控制接口

Runtime 在 `127.0.0.1` 暴露本地 API。

第一版支持：

```text
POST /v1/sessions
GET  /v1/sessions
GET  /v1/sessions/:id
PATCH /v1/sessions/:id

POST /v1/tasks
GET  /v1/tasks/:id
GET  /v1/tasks?session_id=...
POST /v1/tasks/:id/cancel

POST /v1/agents
GET  /v1/agents
GET  /v1/agents/:id
POST /v1/agents/:id/interrupt
POST /v1/agents/:id/switch-model

GET  /v1/providers
GET  /v1/models
POST /v1/model-bindings

POST /v1/auth/pair
POST /v1/auth/token
GET  /v1/clients
POST /v1/approvals/:id/resolve

GET  /v1/ws
```

WebSocket 订阅支持按以下条件过滤：

- `sessionId`
- `taskId`
- `agentId`
- 事件类型

外部控制必须认证。桌面 UI 可以使用 Runtime 启动时生成的内部可信 token。第三方软件必须通过 pairing 流程获得带 scope 的 capability token。

MCP 等 Runtime API 稳定后再加。MCP tools 可以映射到这些 Runtime 操作：

- `create_session`
- `create_task`
- `cancel_task`
- `list_models`
- `switch_session_model`
- `spawn_agent`
- `get_task_status`
- `request_permission`

## 权限和审批

权限原则：

- 默认拒绝。
- 最小权限。
- 高风险动作需要用户明确批准。
- 决策可审计。
- 客户端授权可撤销。

Capability 示例：

- `session:read`
- `session:write`
- `task:create`
- `task:read`
- `task:cancel`
- `agent:spawn`
- `agent:interrupt`
- `model:list`
- `model:switch`
- `event:subscribe`
- `tool:filesystem:read`
- `tool:filesystem:write`
- `tool:shell:exec`
- `tool:browser:control`
- `admin:settings`
- `admin:providers`

高风险动作会产生审批请求：

- 执行 shell 命令。
- 写入当前工作区之外的文件。
- 把凭证发送到新配置的 host。
- 把活跃会话切换到高成本模型。
- 给第三方客户端授予新 capability。

审批结果：

- `allow_once`
- `allow_for_session`
- `allow_for_client`
- `deny`

## 多智能体 Runtime

第一阶段只需要一个活跃智能体，但 Runtime 必须显式建模 Agent，避免后续多智能体实现时重写核心。

未来多智能体执行使用：

- 任务队列负责调度。
- 每个 Agent 绑定自己的 model profile。
- 每个 Task 启动时拿配置快照。
- Cancellation token 树负责取消。
- Event stream 负责观察运行状态。
- Resource lock 保护共享 artifact 和 workspace path。

取消层级：

- 单个 Provider 流。
- 单个工具调用。
- 单个 Task。
- 单个 Agent。
- 一个 Session 下的全部任务。

共享资源冲突策略：

- queue
- reject
- fork candidate output
- ask user

默认策略：

- 代码和文本 artifact 优先生成候选或 fork。
- 配置和工作区写入优先排队或询问用户。

## UI 产品形态

第一屏应该是可用的软件本体，不是营销页。

主要区域：

- 会话列表
- 当前对话/工作区域
- 模型/profile 切换器
- 当前智能体状态
- 任务进度时间线
- 事件/日志抽屉
- 设置和 Provider 配置
- 审批中心

模型切换器应该操作 profile，而不是只暴露原始 Provider 模型名。设置页仍然可以展示 Provider 和原始模型细节。

智能体状态需要清楚显示每个 Agent 正在使用哪个 profile/model。

## 阶段计划

### Phase 0：架构规格

交付物：

- 本设计规格。
- 实施计划。
- 必要的架构决策记录。

本阶段不写生产代码。

### Phase 1：最小桌面 Runtime

交付物：

- pnpm workspace 脚手架。
- Electron 桌面应用。
- 由桌面应用启动 daemon 进程。
- shared schemas 包。
- HTTP health endpoint。
- WebSocket event connection。
- 连接 daemon 的简单 renderer。
- 支持 TOML 的 config loader。
- 基础 Provider/Profile schema 校验。

成功标准：

- 桌面应用能启动。
- daemon 能启动。
- UI 能显示 daemon 状态。
- UI 能列出配置中的 model profile。
- 测试覆盖 config loading 和 health API。

### Phase 2：Provider 和模型切换

交付物：

- ProviderAdapter contract。
- OpenAI-compatible adapter。
- OpenAI provider instance。
- OpenRouter provider instance。
- Ollama provider instance。
- ModelProfile resolver。
- UI 模型/profile 切换器。

成功标准：

- 用户能在 UI 中切换 profile。
- 新任务使用被选中的 profile。
- 运行中的任务不会因为用户切换模型而改变配置快照。

### Phase 3：Session 和 Task

交付物：

- SQLite 存储。
- Session CRUD。
- Task CRUD 和状态生命周期。
- Event 持久化。
- 使用单 Agent 的基础 chat task。
- Task cancellation path。

成功标准：

- UI 和 API 都能创建 Session。
- Task 输出能流式显示到 UI。
- Task 可以取消。
- WebSocket 能看到事件。

### Phase 4：外部控制

交付物：

- Pairing 流程。
- 带 scope 的本地 bearer token。
- Client registry。
- Permission checks。
- 外部 task creation API。
- 外部 event subscription。

成功标准：

- 第三方本地客户端可以配对、创建任务、观察事件、取消任务。
- 未配对客户端无法控制 Runtime。

### Phase 5：多智能体基础

交付物：

- Agent instance registry。
- 每个 Agent 的 model profile binding。
- planner/coder/reviewer 角色。
- 串行多智能体工作流。
- Superpowers workflow pack 表示。

成功标准：

- 一个 Session 可以创建多个 Agent。
- 每个 Agent 可以使用不同 profile。
- Workflow event 能显示哪个 Agent 做了什么。

### Phase 6：并发智能体和 MCP

交付物：

- 并发 task scheduler。
- Worker isolation。
- Resource locks。
- Approval center。
- MCP server compatibility layer。

成功标准：

- 多个 Agent 可以并发运行，不混用模型配置和事件流。
- MCP client 可以调用稳定的 Runtime 操作。

## 测试策略

配置测试：

- 解析合法 TOML 配置。
- 拒绝非法 Provider type。
- 按文档顺序合并配置层。
- 阻止 workspace config 静默加入不安全密钥。
- auth source 缺失时给出明确失败。

Provider contract 测试：

- 把统一请求映射为 Provider 专属 payload。
- 把 Provider stream 映射为统一事件。
- 归一化 Provider 错误。
- 测试 `static`、`remote`、`hybrid` 模型目录。

Runtime 测试：

- 创建 Session。
- 创建 Task。
- 转换 Task 状态。
- 取消 queued 和 running Task。
- 输出预期事件。
- 保留运行中 Task 的配置快照。

安全测试：

- Renderer 不能访问原始 API key。
- 日志会脱敏 secret。
- 未知凭证 host 需要信任确认。
- 未配对本地 client 被拒绝。
- capability token 不能执行 scope 外动作。

UI/E2E 测试：

- App 能启动。
- daemon 连接状态能显示。
- profile list 能加载。
- 模型切换应用到下一个 Task。
- Task stream 能显示在 UI。
- 取消操作能更新 Task 状态。

## 风险和缓解

风险：Electron Main 变成业务大杂烩。  
缓解：编排逻辑放在 daemon 模块中，Main 只暴露窄范围桌面壳 API。

风险：Provider 抽象太薄。  
缓解：定义稳定 Runtime request 和 event 类型，并显式标记模型能力。

风险：Provider 抽象太厚，隐藏供应商特有能力。  
缓解：保留 Provider metadata 和 capability flags，供策略层和 UI 使用。

风险：本地 HTTP API 成为安全漏洞。  
缓解：只绑定 localhost，要求 pairing/token auth，使用 capability scope，并审计高风险操作。

风险：兼容 Codex 配置造成意外行为。  
缓解：Codex 配置只作为兼容输入读取，在 UI 显示配置来源，默认不写回 Codex 配置。

风险：多智能体并发导致状态冲突。  
缓解：从第一版就建模 Task、Agent、Event、Cancellation 和 Resource Lock，即使 Phase 1 只跑一个 Agent。

风险：Superpowers workflow 被写死在 prompt 字符串里。  
缓解：把 workflow 表示成 pack，包含步骤、角色、必需 review 和审批点。

## 待确认决策

1. 产品名和应用配置目录名。  
   已确定：中文名 `灵枢`，英文名 `Lingshu`，仓库/包名建议使用 `lingshu-desktop`，配置目录使用 `.lingshu`。

2. SQLite 包选择。  
   当前建议：实施计划阶段根据 Electron 和 Node 版本兼容性选择成熟包。

3. 第一个真实云端 Provider。  
   当前建议：先实现 OpenAI-compatible 传输，再在其上补 OpenAI 和 OpenRouter profile。

4. 关闭所有窗口后 daemon 是否继续运行。  
   当前建议：Phase 1 随 App 关闭 daemon。Phase 2 做托盘/后台模式时再调整。

## 审阅门槛

这份规格等待用户审阅。确认后，下一步写详细实施计划：

```text
docs/superpowers/plans/2026-05-09-runtime-first-desktop-agent.md
```

实施阶段使用 subagent-driven development：每个任务派发新的子智能体，并设置规格符合性审查和代码质量审查。
