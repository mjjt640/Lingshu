# 灵枢 / Lingshu

灵枢是 Runtime-first 的桌面智能体软件。本地 Agent Runtime 是核心，桌面 UI 和外部控制接口都是 Runtime 客户端。

## Phase 1 目标

- Electron 启动
- 本地 daemon 启动
- UI 连接 Runtime
- UI 显示 Runtime 状态
- UI 显示 model profile

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
