# Runtime-First Desktop Agent Design

Status: approved direction, design spec for review
Date: 2026-05-09
Project: claude-code-desktop

## Background

The project has been reset to an empty baseline. The old CLI-oriented implementation and related branches were removed because they were influencing the redesign too heavily.

The new product should be a real desktop software system, not a visual wrapper around a CLI. It must support multiple model providers, config-file based API key loading, in-app model switching, a future multi-agent runtime where each agent can use a different model, and an interface that lets other local software control it.

The central design decision is:

> Build a local Agent Runtime first. The desktop UI is the official client of that runtime, not the runtime itself.

## Goals

1. Build a desktop application that can run independently of any underlying CLI tool.
2. Keep the core agent orchestration in a local runtime service with explicit APIs.
3. Support multiple model providers through a unified provider abstraction.
4. Load API keys and provider settings from TOML config files, with Codex-style config compatibility.
5. Let users switch models directly inside the software.
6. Prepare the runtime for multiple concurrent agents, where each agent can use a different model profile.
7. Expose a local control interface so other software can create sessions, start tasks, observe progress, switch models, and cancel work.
8. Keep secret handling, external control, and high-risk tool execution behind explicit security boundaries.

## Non-Goals

1. Do not rebuild the old CLI-based architecture.
2. Do not make the first version depend on Claude Code, Codex CLI, or any other external CLI as the core execution engine.
3. Do not implement full multi-agent concurrency in the first milestone.
4. Do not make MCP the internal runtime protocol. MCP can be added later as an external compatibility layer.
5. Do not put raw API keys in renderer/UI state.
6. Do not write back to `~/.codex/config.toml` by default.

## Recommended Stack

- Desktop shell: Electron
- UI: React, TypeScript, Vite
- Runtime service: Node.js, TypeScript
- Package management: pnpm workspaces
- Shared contracts: TypeScript types plus Zod schemas
- Local storage: SQLite through a mature Node package
- Local control interface: HTTP API plus WebSocket event stream
- Tests: Vitest for unit and integration tests, Playwright for desktop/UI flows
- Packaging: Electron Forge, with build details kept replaceable if packaging constraints change

Electron is preferred for the first version because it keeps the UI, runtime, model adapters, local APIs, and testing stack in one TypeScript ecosystem. Tauri remains a possible later option, but Rust plus a Node sidecar would add too much early complexity for this project.

## Architecture

The product is split into four execution areas:

```text
Desktop UI <-> Electron Main <-> Runtime Daemon <-> Workers / Providers / Tools
                  |
                  +-> OS integration

External Software <-> Local HTTP API / WebSocket <-> Runtime Daemon
```

### Desktop Renderer

The renderer owns user-facing interface only:

- chat/session views
- model/profile switcher
- agent status panels
- task progress and event timeline
- settings screens
- permission and approval dialogs

It must not call provider SDKs directly and must not receive raw secrets.

### Electron Main

Electron main owns shell responsibilities:

- create windows
- manage tray and app lifecycle
- start or reconnect to the runtime daemon
- handle deep links and app-level shortcuts
- expose a narrow preload bridge
- coordinate desktop notifications

It should not contain agent orchestration or model-provider business logic.

### Runtime Daemon

The daemon is the real core. It owns:

- config loading and validation
- provider registry and model catalog
- session, task, run, and agent lifecycle
- model profile resolution
- task scheduling
- cancellation
- local control API
- WebSocket event stream
- local storage
- permission checks
- audit events

The first implementation can run the daemon as a child process launched by Electron. Later it can become a longer-lived background service.

### Workers

Workers are introduced once long-running agent work or risky tools need isolation. They own:

- individual agent execution
- long-running tool calls
- cancellable model streams
- per-task resource isolation

Workers are not required for the first scaffold, but the runtime interfaces should leave space for them.

## Module Layout

The first codebase should use a small monorepo:

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

Responsibilities:

- `config`: read, merge, validate, and watch config files.
- `providers`: adapt OpenAI, Anthropic, OpenRouter, Ollama, and OpenAI-compatible APIs.
- `models`: maintain model descriptors, capabilities, and catalog policies.
- `sessions`: manage conversation/work contexts.
- `tasks`: manage queued, running, completed, failed, and cancelled work.
- `agents`: manage agent instances and per-agent model bindings.
- `workflows`: represent Superpowers-style workflows as data and state machines.
- `tools`: register tools behind permissions and timeouts.
- `permissions`: authenticate clients, check capabilities, and create approval requests.
- `storage`: own SQLite migrations and repositories.
- `events`: publish domain events to UI, logs, and WebSocket subscribers.
- `control-api`: expose local HTTP and WebSocket endpoints.

## Core Domain Model

### Session

A `Session` is a work context.

Fields:

- `sessionId`
- `title`
- `workspaceId`
- `createdBy`
- `defaultModelProfileId`
- `state`: `active | paused | archived | completed`
- `policyRef`
- `metadata`
- `createdAt`
- `updatedAt`

A session can contain multiple tasks and multiple agents.

### Task

A `Task` is the scheduling unit.

Fields:

- `taskId`
- `sessionId`
- `parentTaskId`
- `kind`: `chat | plan | execute | tool_call | review | background_job`
- `input`
- `status`: `queued | running | waiting_approval | cancelling | cancelled | failed | completed`
- `priority`
- `requestedBy`
- `assignedAgentId`
- `modelProfileId`
- `resultRef`
- `createdAt`
- `startedAt`
- `endedAt`

Tasks are cancellable, retryable, observable, and persisted.

### AgentInstance

An `AgentInstance` is one active agent within a session.

Fields:

- `agentId`
- `sessionId`
- `role`: `primary | planner | coder | reviewer | tool_runner | observer`
- `state`: `idle | running | waiting_input | blocked | cancelling | cancelled | failed`
- `modelProfileId`
- `instructionProfileRef`
- `capabilityProfileRef`
- `currentTaskId`
- `parentAgentId`
- `createdAt`
- `lastHeartbeatAt`

This object is the future foundation for multi-agent execution.

### ModelBinding

Model selection is layered, not global-only.

Priority:

```text
task > agent > session > global
```

Fields:

- `bindingId`
- `scopeType`: `global | session | agent | task`
- `scopeId`
- `providerId`
- `model`
- `parameters`
- `fallbackChain`
- `reason`

Changing a model in the UI affects new tasks. Running tasks keep the config snapshot they started with.

### Event

The runtime emits append-only domain events.

Important event types:

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

The UI and external clients should rebuild visible state from snapshots plus events.

## Provider and Model Design

The provider layer uses five core objects:

- `ProviderKind`: `openai | anthropic | openrouter | ollama | openai-compatible`
- `ProviderInstance`: named provider config with base URL, auth config, headers, and catalog policy
- `ModelProfile`: user-facing profile such as `fast`, `deep`, or `local`
- `AgentBinding`: mapping from agent role or agent id to model profile
- `ProviderAdapter`: implementation that maps unified runtime requests to vendor-specific APIs

Unified request fields:

- `messages`
- `systemPrompt`
- `tools`
- `attachments`
- `temperature`
- `maxOutputTokens`
- `responseFormat`
- `reasoning`
- `stream`

Unified stream events:

- `text-delta`
- `tool-call`
- `usage`
- `done`
- `error`

Model capabilities should be explicit:

- `supportsStreaming`
- `supportsTools`
- `supportsVision`
- `supportsJson`
- `supportsReasoning`
- `supportsSystemPrompt`
- `supportsLocalExecution`

OpenRouter should have its own provider kind even if it shares transport code with OpenAI-compatible APIs. Ollama should also have its own provider kind because local discovery, auth, and HTTP behavior differ from cloud providers.

## Config and API Keys

Config format: TOML.

Config locations:

```text
User app config:
%USERPROFILE%\.claude-code-visualizer\config.toml

User app secrets:
%USERPROFILE%\.claude-code-visualizer\secrets.toml

Codex compatibility read:
%USERPROFILE%\.codex\config.toml

Workspace shared config:
<workspace>\.claude-code-visualizer.toml

Workspace local override:
<workspace>\.claude-code-visualizer.local.toml
```

Merge priority:

```text
runtime override > workspace local > workspace shared > user app config > Codex compatibility read > built-in defaults
```

Merge rules:

- arrays replace as a whole
- `auth` blocks replace as a whole
- providers, profiles, and agents merge by key
- profile inheritance is allowed
- provider inheritance is not allowed in the first version

Example:

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

Secret file example:

```toml
[secrets]
anthropic_api_key = "..."
company_llm_key = "..."
```

Auth sources:

- `runtime_secret`: entered in UI and kept only in memory
- `secret_ref`: read from app secrets file
- `env`: read from a named environment variable
- `inline`: allowed only in user-level config
- `none`: for local unauthenticated providers such as Ollama

If a configured auth source fails, the runtime should report a clear error. It should not silently fall back to another secret source.

Security boundaries:

- raw keys stay in the daemon process
- renderer receives only redacted provider summaries
- workspace shared config is treated as untrusted by default
- custom remote base URLs must use HTTPS unless explicitly trusted as localhost or allowlisted
- unknown hosts that would receive credentials require trust confirmation
- logs, crash reports, and exported diagnostics must redact secrets
- provider adapters receive resolved auth data, but they do not read env vars or files directly

## External Control Interface

The runtime exposes a local API bound to `127.0.0.1`.

The first version should support:

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

WebSocket subscriptions support filtering by:

- `sessionId`
- `taskId`
- `agentId`
- event type

External control must require authentication. The desktop UI can use an internal trusted client token generated at runtime. Third-party software should use a pairing flow and receive scoped capability tokens.

MCP should be added after the runtime API is stable. MCP tools can map onto runtime operations such as:

- `create_session`
- `create_task`
- `cancel_task`
- `list_models`
- `switch_session_model`
- `spawn_agent`
- `get_task_status`
- `request_permission`

## Permissions and Approvals

Permission principles:

- deny by default
- least privilege
- explicit user approval for high-risk actions
- auditable decisions
- revocable clients

Capability examples:

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

High-risk actions can produce approval requests:

- run shell commands
- write outside the current workspace
- send credentials to a newly configured host
- switch an active session to a costly model
- grant a third-party client new capabilities

Approval decisions:

- `allow_once`
- `allow_for_session`
- `allow_for_client`
- `deny`

## Multi-Agent Runtime

The first milestone only needs one active agent. The runtime must still model agents explicitly so later multi-agent execution does not require a rewrite.

Future multi-agent execution uses:

- task queue for scheduling
- per-agent model profile binding
- per-task config snapshot
- cancellation token tree
- event stream for observation
- resource locks for shared artifacts and workspace paths

Cancellation levels:

- single provider stream
- single tool call
- single task
- single agent
- all tasks in a session

Shared resource conflict strategies:

- queue
- reject
- fork candidate output
- ask user

Default behavior:

- code and text artifacts prefer candidate/fork behavior
- config and workspace mutations prefer queue or ask-user behavior

## UI Product Shape

The first usable screen should be the application itself, not a marketing page.

Primary areas:

- session list
- active conversation/work area
- model/profile switcher
- current agent status
- task progress timeline
- event/log drawer
- settings and provider config
- approval center

The model switcher should operate on profiles, not raw provider model names only. The UI can still expose provider and raw model details in settings.

Agent status should make it clear which profile/model each agent is using.

## Phase Plan

### Phase 0: Architecture Spec

Deliverables:

- this design spec
- implementation plan
- initial architecture decision records if needed

No production code is required in this phase.

### Phase 1: Minimal Desktop Runtime

Deliverables:

- pnpm workspace scaffold
- Electron desktop app
- daemon process launched by desktop app
- shared schemas package
- HTTP health endpoint
- WebSocket event connection
- simple renderer connected to daemon
- config loader with TOML parsing
- basic provider/profile schema validation

Success criteria:

- desktop app starts
- daemon starts
- UI can show daemon status
- UI can list configured model profiles from config
- tests cover config loading and health API

### Phase 2: Provider and Model Switching

Deliverables:

- provider adapter contract
- OpenAI-compatible adapter
- OpenAI provider instance support
- OpenRouter provider instance support
- Ollama provider instance support
- model profile resolver
- UI model/profile switcher

Success criteria:

- user can switch profile in the UI
- new tasks use the selected profile
- running task config snapshots do not mutate when the user switches models

### Phase 3: Sessions and Tasks

Deliverables:

- SQLite storage
- session CRUD
- task CRUD and status lifecycle
- event persistence
- basic chat task using one agent
- task cancellation path

Success criteria:

- session can be created from UI and API
- task can stream output to UI
- task can be cancelled
- events are visible through WebSocket

### Phase 4: External Control

Deliverables:

- pairing flow
- scoped local bearer tokens
- client registry
- permission checks
- external task creation API
- external event subscription

Success criteria:

- a third-party local client can pair, create a task, observe events, and cancel the task
- unpaired clients cannot control the runtime

### Phase 5: Multi-Agent Foundation

Deliverables:

- agent instance registry
- per-agent model profile binding
- planner/coder/reviewer roles
- serial multi-agent workflow
- Superpowers workflow pack representation

Success criteria:

- a session can spawn multiple agents
- each agent can use a different profile
- workflow events show which agent did what

### Phase 6: Concurrent Agents and MCP

Deliverables:

- concurrent task scheduler
- worker isolation
- resource locks
- approval center
- MCP server compatibility layer

Success criteria:

- multiple agents can run concurrently without mixing model configs or event streams
- MCP clients can call stable runtime operations

## Testing Strategy

Config tests:

- parse valid TOML config
- reject invalid provider types
- merge config layers in the documented order
- prevent workspace config from silently adding unsafe secrets
- fail clearly when the selected auth source is missing

Provider contract tests:

- map unified requests to provider-specific payloads
- map provider streams to unified events
- normalize provider errors
- test `static`, `remote`, and `hybrid` model catalogs

Runtime tests:

- create session
- create task
- transition task statuses
- cancel queued and running tasks
- emit expected events
- preserve config snapshots for running tasks

Security tests:

- renderer cannot access raw API keys
- logs redact secrets
- unknown credential hosts require trust
- unpaired local clients are rejected
- capability tokens cannot perform actions outside their scope

UI/E2E tests:

- app launches
- daemon connection status appears
- profile list loads
- model switch applies to the next task
- task stream appears in the UI
- cancellation updates task status

## Risks and Mitigations

Risk: Electron main becomes a large business-logic container.
Mitigation: keep orchestration in daemon modules and expose only narrow shell APIs from main.

Risk: provider abstraction becomes too thin.
Mitigation: define stable runtime request and event types, plus explicit model capabilities.

Risk: provider abstraction becomes too thick and hides useful vendor capabilities.
Mitigation: keep provider-specific metadata and capability flags available to policy and UI.

Risk: local HTTP API becomes a security hole.
Mitigation: bind to localhost, require pairing/token auth, use capability scopes, and audit high-risk operations.

Risk: config compatibility with Codex creates surprising behavior.
Mitigation: read Codex config as compatibility input only, show config source in UI, and do not write to Codex config by default.

Risk: multi-agent concurrency creates state conflicts.
Mitigation: model tasks, agents, events, cancellation, and resource locks from the beginning even if Phase 1 runs one agent.

Risk: Superpowers workflows become hard-coded prompt strings.
Mitigation: represent workflows as packs with steps, roles, required reviews, and approval points.

## Open Decisions

1. Exact product name and app config directory name.
   Recommended default for now: `claude-code-visualizer` in code paths until the product name is renamed.

2. SQLite package.
   Recommended default for now: choose a mature package during implementation planning after checking current compatibility with Electron and Node versions.

3. First real cloud provider.
   Recommended default for implementation: start with OpenAI-compatible transport, then add OpenAI and OpenRouter profiles on top.

4. Whether daemon should remain alive after all windows close.
   Recommended default for Phase 1: stop daemon with the app. Revisit in Phase 2 when tray/background mode exists.

## Approval Gate

This spec is ready for user review. After approval, the next step is to write a detailed implementation plan at:

```text
docs/superpowers/plans/2026-05-09-runtime-first-desktop-agent.md
```

Implementation should then use subagent-driven development with a fresh subagent per task and review checkpoints.
