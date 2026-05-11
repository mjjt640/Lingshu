# 灵枢 / Lingshu

灵枢是 Runtime-first 的桌面智能体软件。本地 Agent Runtime 是核心，桌面 UI 和外部控制接口都是 Runtime 客户端。

## Phase 1 目标

- Electron 启动
- 本地 daemon 启动
- UI 连接 Runtime
- UI 显示 Runtime 状态
- UI 显示 model profile

## Phase 2 能力

- Provider/Profile 配置：Runtime 会解析 provider、profile 和当前选中 profile，桌面端只消费脱敏后的摘要。
- Codex 风格模型配置兼容：支持 `model_provider`、`model`、`review_model`、`model_reasoning_effort`，以及 `[model_providers.*].base_url`、`wire_api`、`requires_openai_auth`。这些兼容字段只用于归一化，最终运行时配置不保留原始字段。
- 第三方 OpenAI-compatible 中转站：支持自定义 HTTPS `base_url`、本地 HTTP 地址、不透明 model id，以及 `responses` / `chat_completions` 两种 `wire_api`。
- 模型切换 API：`GET /v1/providers`、`GET /v1/models/profiles`、`GET /v1/models/selection`、`PATCH /v1/models/selection`、`POST /v1/tasks/model-snapshot`。
- 桌面端模型切换器：Renderer 可查看当前 profile、provider/model/capability 摘要，并通过选择框切换后续任务使用的模型。
- Task model snapshot 语义：未来任务默认使用当前选中 profile；已创建的 snapshot 不会被后续切换修改；显式 `profileId` 会绑定到对应 profile。
- Runtime 安全边界：Renderer 不接收 raw API key 或 env var name；Phase 2 不做真实模型调用；CORS 只允许本地 desktop dev origin。

## 开发命令

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm test
corepack pnpm typecheck
corepack pnpm --filter @lingshu/desktop start
```

## 配置路径

- `%USERPROFILE%\.lingshu\config.toml`
- `%USERPROFILE%\.lingshu\secrets.toml`
- `<workspace>\.lingshu.toml`
- `<workspace>\.lingshu.local.toml`

## 架构文档

- [Phase 1 Runtime Architecture](./docs/architecture/phase-1-runtime.md)
- [Phase 2 Provider and Model Switching](./docs/architecture/phase-2-provider-model-switching.md)
