# 灵枢 Phase 2 Provider 和模型切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Provider/Profile 解析和运行时模型切换能力，让桌面端可以直接切换当前 profile，并为后续 Task/Agent 使用独立模型快照打基础。

**Architecture:** Phase 2 不做真实模型推理和完整 Task 生命周期。Daemon 新增 ProviderAdapter contract、内置 provider adapters、ModelProfileResolver 和 in-memory ModelSelectionStore；ProviderAdapter 必须能表达 Responses API 与 Chat Completions API 两种请求预览，并能承载 Responses 图片输入。HTTP API 暴露 provider 列表、profile 列表、当前选择、切换接口和一个任务模型快照预览接口。Renderer 通过这些接口显示并切换当前 profile。运行时只向 UI 返回脱敏 provider 信息，不暴露原始 API key。

**Tech Stack:** TypeScript, Node.js, Fastify, React, Vite, Zod, Vitest, pnpm workspace.

---

## Scope

本阶段做：

- 扩展共享 runtime contract 和事件类型。
- 新增 ProviderAdapter contract，支持 `/responses` 和 `/chat/completions` 两种请求预览。
- 新增 OpenAI-compatible adapter，兼容第三方中转站的安全 `base_url` 路径和任意模型名。
- 新增 OpenAI、OpenRouter、Ollama provider adapter 注册。
- 新增 ModelProfileResolver。
- 新增 ModelSelectionStore。
- 兼容 Codex 风格模型配置：`model_provider`、`model`、`review_model`、`model_reasoning_effort`、`[model_providers.*].base_url`、`[model_providers.*].wire_api`。
- 新增模型切换 HTTP API。
- UI 支持直接切换当前 profile。
- 测试证明切换只影响后续快照，已有快照不被修改。
- 测试证明 OpenAI-compatible provider 不写死官方 host/model，能兼容第三方中转站。
- 测试证明 Responses 请求预览可以包含图片输入。

本阶段不做：

- 真实模型 API 调用。
- Chat task 生命周期。
- SQLite 持久化。
- 多智能体并发。
- 外部 pairing/token 鉴权。
- MCP。

## File Structure

```text
packages/shared/src/
  runtime/contracts.ts
  runtime/events.ts
  config/types.ts
  index.ts

apps/daemon/src/
  bootstrap/createDaemonApp.ts
  control-api/modelRoutes.ts
  modules/config/codexCompat.ts
  modules/providers/providerAdapter.ts
  modules/providers/openAiCompatibleAdapter.ts
  modules/providers/ollamaAdapter.ts
  modules/providers/providerRegistry.ts
  modules/models/modelCapabilities.ts
  modules/models/modelProfileResolver.ts
  modules/models/modelSelectionStore.ts

apps/daemon/tests/
  codexCompatConfig.test.ts
  providerRegistry.test.ts
  modelProfileResolver.test.ts
  modelSelectionRoutes.test.ts

apps/desktop/src/renderer/
  api/runtimeClient.ts
  App.tsx
  styles.css

docs/architecture/
  phase-2-provider-model-switching.md
```

## Shared API Contract

Phase 2 的 API 形状如下：

```text
GET   /v1/providers
GET   /v1/models/profiles
GET   /v1/models/selection
PATCH /v1/models/selection
POST  /v1/tasks/model-snapshot
```

`PATCH /v1/models/selection` body:

```json
{
  "profileId": "deep"
}
```

切换成功返回：

```json
{
  "previousProfile": "fast",
  "selectedProfile": "deep",
  "resolvedProfile": {
    "id": "deep",
    "label": "深度模型",
    "provider": {
      "id": "openai_main",
      "type": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "auth": { "source": "env", "status": "configured" }
    },
    "model": "gpt-5.5",
    "parameters": {
      "temperature": 0.1,
      "maxOutputTokens": 16000
    },
    "capabilities": {
      "supportsStreaming": true,
      "supportsTools": true,
      "supportsVision": true,
      "supportsJson": true,
      "supportsReasoning": true,
      "supportsSystemPrompt": true,
      "supportsLocalExecution": false
    },
    "source": "config"
  }
}
```

`POST /v1/tasks/model-snapshot` body:

```json
{
  "profileId": "deep"
}
```

如果 body 为空，使用当前选中的 profile。返回的 snapshot 是不可变配置快照，后续 profile 切换不能修改已生成 snapshot。

---

## Task 1: Shared Runtime Contracts

**Files:**

- Modify: `packages/shared/src/config/types.ts`
- Modify: `packages/shared/src/runtime/contracts.ts`
- Modify: `packages/shared/src/runtime/events.ts`
- Test: `corepack pnpm --filter @lingshu/shared build`, `corepack pnpm typecheck`

- [x] **Step 1: Extend provider and model contract schemas**

Add shared schemas for:

- `ProviderAuthStatusSchema`
- `ProviderSummarySchema`
- `ModelCapabilitiesSchema`
- `ResolvedModelProfileSchema`
- `ModelSelectionResponseSchema`
- `SwitchModelProfileRequestSchema`
- `SwitchModelProfileResponseSchema`
- `TaskModelSnapshotRequestSchema`
- `TaskModelSnapshotResponseSchema`
- `ProvidersResponseSchema`

Requirements:

- Provider summaries must expose only auth source/status, never raw secrets.
- Existing `ModelProfileSummarySchema` must keep backward-compatible fields and add optional capability/provider type fields only if needed.
- Zod schemas must export corresponding TypeScript types.

- [x] **Step 2: Extend runtime events**

Add `model.switched` event:

```ts
{
  type: "model.switched";
  previousProfile: string | null;
  currentProfile: string;
  provider: string;
  model: string;
  switchedAt: string;
}
```

- [x] **Step 3: Verify shared package**

Run:

```bash
corepack pnpm --filter @lingshu/shared build
corepack pnpm typecheck
```

Expected: both exit 0.

- [x] **Step 4: Commit shared contracts**

```bash
git add packages/shared
git commit -m "feat: 扩展模型切换共享契约"
```

---

## Task 2: Provider Registry and Profile Resolver

**Files:**

- Create: `apps/daemon/src/modules/providers/providerAdapter.ts`
- Create: `apps/daemon/src/modules/providers/openAiCompatibleAdapter.ts`
- Create: `apps/daemon/src/modules/providers/ollamaAdapter.ts`
- Create: `apps/daemon/src/modules/providers/providerRegistry.ts`
- Create: `apps/daemon/src/modules/models/modelCapabilities.ts`
- Create: `apps/daemon/src/modules/models/modelProfileResolver.ts`
- Create: `apps/daemon/src/modules/models/modelSelectionStore.ts`
- Create: `apps/daemon/tests/providerRegistry.test.ts`
- Create: `apps/daemon/tests/modelProfileResolver.test.ts`
- Test: `corepack pnpm --filter @lingshu/daemon test`

- [x] **Step 1: Write failing provider registry tests**

Tests must prove:

- OpenAI, OpenRouter, OpenAI-compatible, and Ollama provider configs resolve to adapters.
- Unknown provider kinds cannot happen after schema parsing, but registry still throws clear errors for unsupported kind inputs.
- Provider summaries redact auth values.
- OpenAI-compatible providers support third-party relay base URLs with safe nested paths, such as `https://relay.example.com/proxy/openai/v1`.
- OpenAI-compatible providers treat model ids as opaque strings, including namespaced ids such as `vendor/model:beta`.
- OpenAI-compatible providers can shape both `/chat/completions` and `/responses` request previews.
- Responses request previews can include image input parts.

- [x] **Step 2: Write failing profile resolver tests**

Tests must prove:

- A valid profile resolves to provider id, provider type, model, label, parameters, and capabilities.
- Missing provider throws `Model profile "<id>" references missing provider "<providerId>"`.
- Missing profile throws `Model profile "<id>" was not found`.
- `createTaskModelSnapshot()` returns an immutable snapshot; switching selection later does not mutate an existing snapshot object.

- [x] **Step 3: Implement provider adapter contract**

Define provider-neutral request and stream types. The contract must include:

- `kind`
- `summarizeProvider(providerId, config)`
- `getDefaultCapabilities()`
- `createChatCompletionRequest(input)` for `/chat/completions` request shaping only
- `createResponsesRequest(input)` for `/responses` request shaping only

The unified content model must support text and image input parts:

```ts
type UnifiedContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; imageUrl: string; detail?: "low" | "high" | "auto" };
```

Chat Completions request previews must map image parts to:

```json
{ "type": "image_url", "image_url": { "url": "...", "detail": "auto" } }
```

Responses request previews must map image parts to:

```json
{ "type": "input_image", "image_url": "...", "detail": "auto" }
```

No real network call in Phase 2.

- [x] **Step 4: Implement OpenAI-compatible adapter**

Map the unified request into:

```text
POST {base_url}/chat/completions
Authorization: Bearer <resolved key placeholder>
```

Also map the unified request into:

```text
POST {base_url}/responses
Authorization: Bearer <resolved key placeholder>
```

The returned shaped requests must be testable without sending them. OpenAI and OpenRouter should reuse this adapter with provider-specific default headers/metadata.

Third-party relay compatibility requirements:

- `type = "openai-compatible"` must not hardcode `api.openai.com` or `openrouter.ai`.
- Safe base URLs with nested paths such as `https://relay.example.com/proxy/openai/v1` must remain valid.
- Model ids must be treated as opaque strings, including namespaced or vendor-specific ids such as `vendor/model:beta`.
- Query strings, URL fragments, and URL credentials remain rejected for security.

- [x] **Step 5: Implement Ollama adapter**

Map unified request into:

```text
POST {base_url}/api/chat
```

Ollama default auth status is `none` and `supportsLocalExecution` is `true`.

- [x] **Step 6: Implement ModelProfileResolver and ModelSelectionStore**

Resolver responsibilities:

- list provider summaries
- list profile summaries
- resolve one profile
- create task model snapshot

Selection store responsibilities:

- initialize selected profile from `config.app.default_profile`, else first configured profile, else `null`
- switch only to valid profiles
- return previous and current profile ids

- [x] **Step 7: Verify daemon tests**

Run:

```bash
corepack pnpm --filter @lingshu/daemon test
corepack pnpm typecheck
```

Expected: both exit 0.

- [x] **Step 8: Commit provider resolver**

```bash
git add apps/daemon packages/shared
git commit -m "feat: 添加 provider 注册表和模型解析器"
```

---

## Task 3: Codex-Style Model Config Compatibility

**Files:**

- Modify: `packages/shared/src/config/types.ts`
- Modify: `packages/shared/src/runtime/contracts.ts`
- Modify: `apps/daemon/src/modules/config/configSchema.ts`
- Create: `apps/daemon/src/modules/config/codexCompat.ts`
- Modify: `apps/daemon/src/modules/config/loadConfig.ts`
- Modify: `apps/daemon/src/modules/models/modelProfileResolver.ts`
- Create: `apps/daemon/tests/codexCompatConfig.test.ts`
- Modify: `apps/daemon/tests/loadConfig.test.ts`
- Modify: `apps/daemon/tests/modelProfileResolver.test.ts`
- Test: `corepack pnpm --filter @lingshu/daemon test`

- [x] **Step 1: Write failing Codex-style config tests**

Tests must prove this TOML shape can be loaded and normalized:

```toml
model_provider = "OpenAI"
model = "gpt-5.4"
review_model = "gpt-5.4"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"
model_context_window = 1000000
model_auto_compact_token_limit = 900000

[model_providers.OpenAI]
name = "OpenAI"
base_url = "https://subapi.muxueai.pro"
wire_api = "responses"
requires_openai_auth = true
```

Expected normalized config:

- provider id `OpenAI`
- provider type `openai-compatible`
- provider base url `https://subapi.muxueai.pro`
- provider `wire_api = "responses"`
- provider auth source is env-compatible and does not expose the env var name in summaries
- default profile uses model `gpt-5.4`
- review profile uses `review_model = "gpt-5.4"`
- model reasoning effort is `xhigh`
- selected/default profile points to the primary model profile

- [x] **Step 2: Extend config schemas**

Add:

- `WireApiSchema = "responses" | "chat_completions"`
- `ReasoningEffortSchema = "none" | "minimal" | "low" | "medium" | "high" | "xhigh"`
- provider config optional `wire_api`
- model profile optional `reasoning_effort`
- daemon config top-level compatibility fields:
  - `model_provider`
  - `model`
  - `review_model`
  - `model_reasoning_effort`
  - `disable_response_storage`
  - `network_access`
  - `model_context_window`
  - `model_auto_compact_token_limit`
  - `model_providers`

- [x] **Step 3: Add normalization layer**

Create `codexCompat.ts` to normalize Codex-style fields before final `LingshuConfigSchema.parse()`.

Rules:

- Preserve native Lingshu `[providers]` and `[profiles]`.
- Convert `[model_providers.<id>]` into `providers[<id>]`.
- If `wire_api = "responses"`, provider default request surface is Responses.
- If `wire_api = "chat_completions"`, provider default request surface is Chat Completions.
- If `requires_openai_auth = true`, use `{ source = "env", env = "OPENAI_API_KEY" }` unless native auth is explicitly provided.
- Create primary profile from top-level `model_provider` + `model`.
- Create review profile from top-level `model_provider` + `review_model`.
- Top-level `model_reasoning_effort` applies to both generated profiles unless a native profile overrides it.
- Do not write back to `.codex/config.toml`.

- [x] **Step 4: Resolve reasoning and wire API**

Update model resolver output so resolved profiles include:

- `parameters.reasoningEffort`
- provider summary `wireApi`

Shared schemas must validate these fields.

- [x] **Step 5: Verify daemon tests**

Run:

```bash
corepack pnpm --filter @lingshu/daemon test
corepack pnpm typecheck
```

Expected: both exit 0.

- [x] **Step 6: Commit Codex compatibility**

```bash
git add packages/shared apps/daemon
git commit -m "feat: 兼容 codex 风格模型配置"
```

---

## Task 4: Model Switching HTTP API

**Files:**

- Modify: `apps/daemon/src/bootstrap/createDaemonApp.ts`
- Modify: `apps/daemon/src/control-api/modelRoutes.ts`
- Create: `apps/daemon/tests/modelSelectionRoutes.test.ts`
- Modify: `apps/daemon/tests/healthRoutes.test.ts`
- Modify: `apps/daemon/tests/daemonHttpSmoke.test.ts`
- Test: `corepack pnpm --filter @lingshu/daemon test`

- [x] **Step 1: Write failing route tests**

Tests must prove:

- `GET /v1/providers` returns configured provider summaries.
- `GET /v1/models/profiles` includes `selectedProfile`.
- `GET /v1/models/selection` returns current selected profile and resolved profile.
- `PATCH /v1/models/selection` switches the current profile and publishes `model.switched`.
- Switching to an unknown profile returns HTTP 404 with a clear error.
- `POST /v1/tasks/model-snapshot` captures the profile used for a future task.
- A snapshot created before a switch still points to the old profile after switching.

- [x] **Step 2: Wire resolver/store into app bootstrap**

`createDaemonApp()` should construct one resolver and one in-memory selection store per daemon app instance.

- [x] **Step 3: Implement route handlers**

Routes should parse request bodies with shared Zod schemas. Error responses must use JSON:

```json
{
  "error": "message"
}
```

- [x] **Step 4: Update smoke test**

The real HTTP smoke test should check:

- providers endpoint returns at least `ollama_local`
- selection endpoint returns `local`
- snapshot endpoint returns profile `local`

- [x] **Step 5: Verify daemon tests**

Run:

```bash
corepack pnpm --filter @lingshu/daemon test
corepack pnpm typecheck
```

Expected: both exit 0.

- [x] **Step 6: Commit model switching API**

```bash
git add apps/daemon packages/shared
git commit -m "feat: 添加模型切换 runtime api"
```

---

## Task 5: Desktop Profile Switcher

**Files:**

- Modify: `apps/desktop/src/renderer/api/runtimeClient.ts`
- Modify: `apps/desktop/src/renderer/App.tsx`
- Modify: `apps/desktop/src/renderer/styles.css`
- Test: `corepack pnpm --filter @lingshu/desktop build`, `corepack pnpm typecheck`

- [x] **Step 1: Extend renderer runtime client**

Add:

- `fetchProviders()`
- `fetchModelSelection()`
- `switchModelProfile(profileId: string)`
- `createTaskModelSnapshot(profileId?: string)`

All responses must be validated with shared Zod schemas.

- [x] **Step 2: Add profile switching UI**

Update the model profile area so the user can:

- see the current selected profile
- switch profile from a `<select>`
- see provider type, provider id, model id, and capability summary
- see a disabled/loading state while switching
- see clear error text when switching fails

The UI should remain a real software surface, not a landing page.

- [x] **Step 3: Show snapshot semantics**

Add a small runtime panel showing the latest task model snapshot after switching or after pressing a "生成下一任务模型快照" button. This demonstrates that future tasks will use the selected profile snapshot without implementing full Task CRUD yet.

- [x] **Step 4: Verify desktop build**

Run:

```bash
corepack pnpm --filter @lingshu/desktop build
corepack pnpm typecheck
```

Expected: both exit 0.

- [x] **Step 5: Commit desktop switcher**

```bash
git add apps/desktop packages/shared
git commit -m "feat: 添加桌面端模型切换器"
```

---

## Task 6: Documentation and Phase 2 Verification

**Files:**

- Modify: `README.md`
- Create: `docs/architecture/phase-2-provider-model-switching.md`
- Test: link path self-check, `git diff --check`

- [x] **Step 1: Update README**

Document Phase 2 capabilities:

- provider/profile config
- model switching endpoints
- desktop switcher
- task model snapshot semantics

- [x] **Step 2: Add architecture note**

Create `docs/architecture/phase-2-provider-model-switching.md` explaining:

- ProviderAdapter boundary
- profile resolver
- selected profile store
- snapshot rule: future tasks use selected profile, existing snapshots stay unchanged
- no raw secrets in renderer

- [x] **Step 3: Run documentation verification**

Run:

```bash
Test-Path docs/architecture/phase-2-provider-model-switching.md
git status --short
git diff --check
```

Expected:

- architecture link target exists
- git status only contains intended docs before commit
- git diff --check exits 0

- [x] **Step 4: Commit docs**

```bash
git add README.md docs/architecture/phase-2-provider-model-switching.md docs/superpowers/plans/2026-05-10-phase-2-provider-model-switching.md
git commit -m "docs: 记录 phase 2 provider 和模型切换"
```

---

## Self-Review Checklist

- Phase 2 does not perform real model API calls.
- Renderer never receives raw API keys or inline secret values.
- Provider summaries are safe to show in UI.
- UI can switch selected profile.
- New task model snapshot uses the selected profile.
- Existing task model snapshots are immutable after switching.
- Tests cover resolver behavior, API behavior, and route errors.
- Documentation link self-check and `git diff --check` pass before final report.
