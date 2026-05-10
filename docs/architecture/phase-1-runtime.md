# Phase 1 Runtime Architecture

Phase 1 establishes Lingshu as a Runtime-first desktop agent application. The local Agent Runtime runs as the central service, while the desktop UI and future external control surfaces act as Runtime clients.

## Process Model

```text
Electron Main
├── BrowserWindow / Renderer
│   ├── HTTP -> Runtime Daemon /v1/health
│   ├── HTTP -> Runtime Daemon /v1/models/profiles
│   └── WebSocket -> Runtime Daemon /v1/ws
└── Runtime Daemon child process
    ├── HTTP API
    │   ├── /v1/health
    │   └── /v1/models/profiles
    └── WebSocket API
        └── /v1/ws
```

## Boundaries

- Renderer only talks to the Runtime through HTTP and WebSocket APIs.
- Electron Main only starts and stops the Runtime Daemon child process.
- Daemon reads configuration, exposes model profiles, and publishes runtime events.
- Shared package owns the cross-process contracts used by Electron Main, Renderer, and Daemon.

## Phase 1 Exclusions

Phase 1 does not include:

- Real model calls
- ProviderAdapter
- Multi-agent concurrency
- Local token authentication
- MCP

## Known Follow-up Risks / Work

- Packaging needs to replace the development `daemonEntry` path with a `resourcesPath` / `extraResources` strategy.
- Workspace shared config trust policy must be completed before real model calls are enabled.
