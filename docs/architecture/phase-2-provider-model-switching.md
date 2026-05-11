# Phase 2 Provider 和模型切换

Phase 2 建立 Provider/Profile 解析、运行时模型切换和任务模型快照语义。它为后续真实 Task/Agent 执行准备模型选择能力，但本阶段不直接调用模型 API。

## 范围

本阶段包含：

- 解析 provider/profile 配置，并输出安全摘要。
- 兼容 Codex 风格模型配置。
- 为 OpenAI-compatible、OpenRouter、OpenAI 和 Ollama 建立 provider adapter。
- 暴露模型切换 HTTP API。
- 在桌面端提供 profile switcher。
- 为未来任务创建不可变 model snapshot。

本阶段不包含：

- 真实模型执行或流式推理。
- 完整 Chat Task 生命周期。
- SQLite 持久化。
- 多智能体 model-per-agent 分配。
- 外部 pairing、token 或账号鉴权。
- MCP 集成。

## ProviderAdapter 边界

`ProviderAdapter` 只生成 request preview，不发送真实网络请求。它把统一输入转换为目标 wire API 的请求形状，便于测试和 UI/Runtime 预览。

- 支持 `chat_completions` 和 `responses` 两种 request surface。
- 支持文本和图片输入；图片会按目标 API 转成对应 input part。
- `reasoning_effort` 会进入 preview，供后续真实执行复用。
- provider 的 `wire_api` 决定默认 request surface；调用方仍可显式创建某一种 preview。

## OpenAI-compatible 中转站

OpenAI-compatible provider 面向第三方中转站和自建 relay。策略是允许配置差异，但收紧 URL 安全边界。

- 远程地址必须使用 HTTPS；本地开发可使用 HTTP。
- `base_url` 可以包含安全 path，例如 `https://relay.example.com/proxy/openai/v1`。
- 拒绝带 credentials、query 或 hash 的 URL。
- model id 按 opaque string 处理，不假设官方模型命名。
- `wire_api` 可选 `responses` 或 `chat_completions`。

## Codex-style 配置归一化

归一化层读取 Codex 风格字段，再转换为 Lingshu 原生配置。

支持字段包括：

```toml
model_provider = "OpenAI"
model = "gpt-5.4"
review_model = "gpt-5.4"
model_reasoning_effort = "xhigh"

[model_providers.OpenAI]
base_url = "https://relay.example.com/v1"
wire_api = "responses"
requires_openai_auth = true
```

规则：

- `model_provider`、`model`、`review_model` 和 `model_reasoning_effort` 只参与 normalize。
- `[model_providers.*]` 会转换为原生 `providers`。
- `requires_openai_auth = true` 映射为 `OPENAI_API_KEY` 来源，但 renderer 只看到 auth source/status，不看到 env var name。
- 原生 Lingshu `providers` 和 `profiles` 优先，不会被兼容字段覆盖。
- 最终 `LingshuConfig` 不残留 Codex raw compatibility fields。

## Resolver 和 Selection Store

`ModelProfileResolver` 负责把配置解析成运行时可用的 profile：

- 列出 provider summaries。
- 列出 profile summaries。
- 解析单个 profile 的 provider、model、capabilities 和 parameters。
- 创建 task model snapshot。

`ModelSelectionStore` 只保存当前选中 profile。它在 Phase 2 使用内存存储：启动时从默认 profile 初始化，没有默认值时选第一个 profile。

## HTTP API

Phase 2 暴露这些 Runtime API：

```text
GET   /v1/providers
GET   /v1/models/profiles
GET   /v1/models/selection
PATCH /v1/models/selection
POST  /v1/tasks/model-snapshot
```

`PATCH /v1/models/selection` 切换当前 profile，并尽力发布 `model.switched` 事件。事件发布失败不应破坏切换结果。

`POST /v1/tasks/model-snapshot` 创建未来 task 使用的模型快照；body 为空时使用当前选中 profile，传入 `profileId` 时绑定到指定 profile。

## Snapshot 规则

- 未来 task 默认使用当前选中 profile。
- 已创建 snapshot 不随后续模型切换变化。
- 显式 `profileId` 创建的 snapshot 固定绑定到该 profile。

这个规则让模型切换影响后续任务，同时保护已排队或已创建任务的执行语义。

## 桌面端切换器

桌面端 profile switcher 提供一个真实 Runtime 控制面：

- 通过 select 切换当前 profile。
- 显示 provider id、provider type、model id 和 capability 摘要。
- 展示最近一次 task model snapshot。
- 在切换和 snapshot 创建失败时显示错误状态。

## 安全边界

- Renderer 不接收 raw API key、inline secret 或 env var name。
- ProviderAdapter 不做真实模型调用，只生成 request preview。
- `model.switched` 是 best-effort 事件，不能成为切换是否成功的唯一依据。
- Runtime CORS allowlist 只允许本地 desktop dev origin。

## 后续事项

- 接入真实模型执行。
- 持久化当前模型选择。
- 支持多智能体 model-per-agent 配置。
- 增加 pairing/auth 边界。
- 可选强化 path-specific CORS methods。
