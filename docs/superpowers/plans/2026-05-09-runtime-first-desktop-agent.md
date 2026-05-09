# 灵枢 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建灵枢第一阶段最小桌面 Runtime：Electron 桌面壳能启动 Node.js daemon，UI 能显示 daemon 状态和配置中的模型 profile。

**Architecture:** 采用 pnpm workspace monorepo。`apps/daemon` 提供本地 Runtime 服务和 HTTP/WebSocket 接口，`apps/desktop` 提供 Electron + React 桌面客户端，`packages/shared` 存放共享 schema、事件、类型和 API 契约。Phase 1 只实现单 daemon、单 UI、配置读取、health API、profile 列表和事件连接。

**Tech Stack:** TypeScript, Node.js, Electron, React, Vite, pnpm workspace, Zod, Fastify, ws, TOML, Vitest, Playwright scaffold.

---

## Scope

本计划只实现设计规格中的 Phase 1。

本阶段做：

- pnpm workspace 脚手架。
- 共享 schema/types 包。
- daemon health API。
- daemon WebSocket 事件连接。
- TOML config loader。
- Provider/Profile schema 校验。
- Electron 桌面应用。
- Renderer 显示 daemon 状态和 model profiles。
- 单元测试和最小集成测试。

本阶段不做：

- 真实模型调用。
- 完整 ProviderAdapter。
- 多智能体执行。
- SQLite 持久化。
- 外部 pairing 鉴权。
- MCP。
- 打包发布。

## File Structure

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
vitest.config.ts
.gitignore

apps/
  daemon/
    package.json
    tsconfig.json
    src/
      index.ts
      bootstrap/createDaemonApp.ts
      control-api/healthRoutes.ts
      control-api/modelRoutes.ts
      control-api/eventSocket.ts
      modules/config/configPaths.ts
      modules/config/loadConfig.ts
      modules/config/configSchema.ts
      modules/config/defaultConfig.ts
      modules/events/eventBus.ts
    tests/
      configSchema.test.ts
      loadConfig.test.ts
      healthRoutes.test.ts

  desktop/
    package.json
    tsconfig.json
    index.html
    src/
      main/main.ts
      preload/preload.ts
      renderer/App.tsx
      renderer/main.tsx
      renderer/styles.css
      renderer/api/runtimeClient.ts

packages/
  shared/
    package.json
    tsconfig.json
    src/
      index.ts
      ids.ts
      runtime/contracts.ts
      runtime/events.ts
      config/types.ts
```

## Shared Conventions

Commands are run from repository root unless a task says otherwise.

Use these scripts consistently:

```json
{
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "typecheck": "tsc -b",
    "dev:daemon": "pnpm --filter @lingshu/daemon dev",
    "dev:desktop": "pnpm --filter @lingshu/desktop dev"
  }
}
```

Use these package names:

- Root package: `lingshu-desktop`
- Shared package: `@lingshu/shared`
- Daemon package: `@lingshu/daemon`
- Desktop package: `@lingshu/desktop`

---

## Task 1: Workspace Scaffold

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Modify: `.gitignore`
- Test: `pnpm install`, `pnpm typecheck`

- [ ] **Step 1: Create root package manifest**

Create `package.json`:

```json
{
  "name": "lingshu-desktop",
  "version": "0.1.0",
  "private": true,
  "description": "灵枢 / Lingshu runtime-first desktop agent platform.",
  "type": "module",
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "typecheck": "tsc -b",
    "dev:daemon": "pnpm --filter @lingshu/daemon dev",
    "dev:desktop": "pnpm --filter @lingshu/desktop dev"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.9.0",
    "vite": "^7.0.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create pnpm workspace file**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create base TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 4: Create Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"]
  }
});
```

- [ ] **Step 5: Update .gitignore**

Modify `.gitignore` to contain:

```gitignore
node_modules/
dist/
out/
coverage/
.vite/
.env
.env.*
!.env.example
*.log
*.tsbuildinfo

.lingshu.local.toml
```

- [ ] **Step 6: Install dependencies**

Run:

```bash
pnpm install
```

Expected:

```text
Done in
```

- [ ] **Step 7: Verify typecheck command is wired**

Run:

```bash
pnpm typecheck
```

Expected at this moment:

```text
No projects found in this workspace
```

or an equivalent TypeScript message that no project references exist yet. Do not treat this as a failure before packages exist.

- [ ] **Step 8: Commit scaffold**

Run:

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .gitignore pnpm-lock.yaml
git commit -m "chore: 初始化灵枢 workspace 脚手架"
```

---

## Task 2: Shared Runtime Contracts

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/ids.ts`
- Create: `packages/shared/src/runtime/contracts.ts`
- Create: `packages/shared/src/runtime/events.ts`
- Create: `packages/shared/src/config/types.ts`
- Test: `pnpm --filter @lingshu/shared build`, `pnpm typecheck`

- [ ] **Step 1: Create shared package manifest**

Create `packages/shared/package.json`:

```json
{
  "name": "@lingshu/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0"
  }
}
```

- [ ] **Step 2: Create shared tsconfig**

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": false,
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Add ID helpers**

Create `packages/shared/src/ids.ts`:

```ts
export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type SessionId = Brand<string, "SessionId">;
export type TaskId = Brand<string, "TaskId">;
export type AgentId = Brand<string, "AgentId">;
export type ModelProfileId = Brand<string, "ModelProfileId">;

export function createId<TBrand extends string>(prefix: string): Brand<string, TBrand> {
  const random = crypto.randomUUID();
  return `${prefix}_${random}` as Brand<string, TBrand>;
}
```

- [ ] **Step 4: Add runtime contracts**

Create `packages/shared/src/runtime/contracts.ts`:

```ts
import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.literal("lingshu-runtime"),
  status: z.literal("ok"),
  version: z.string(),
  startedAt: z.string().datetime()
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ModelProfileSummarySchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  label: z.string().min(1),
  source: z.string().min(1)
});

export type ModelProfileSummary = z.infer<typeof ModelProfileSummarySchema>;

export const ModelProfilesResponseSchema = z.object({
  defaultProfile: z.string().min(1).nullable(),
  profiles: z.array(ModelProfileSummarySchema)
});

export type ModelProfilesResponse = z.infer<typeof ModelProfilesResponseSchema>;
```

- [ ] **Step 5: Add runtime events**

Create `packages/shared/src/runtime/events.ts`:

```ts
import { z } from "zod";

export const RuntimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("runtime.ready"),
    service: z.literal("lingshu-runtime"),
    startedAt: z.string().datetime()
  }),
  z.object({
    type: z.literal("model.profiles_loaded"),
    count: z.number().int().nonnegative()
  }),
  z.object({
    type: z.literal("runtime.error"),
    message: z.string().min(1)
  })
]);

export type RuntimeEvent = z.infer<typeof RuntimeEventSchema>;
```

- [ ] **Step 6: Add config types**

Create `packages/shared/src/config/types.ts`:

```ts
import { z } from "zod";

export const AuthSourceSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("none") }),
  z.object({ source: z.literal("env"), env: z.string().min(1) }),
  z.object({ source: z.literal("secret_ref"), ref: z.string().min(1) }),
  z.object({ source: z.literal("runtime_secret"), id: z.string().min(1) }),
  z.object({ source: z.literal("inline"), value: z.string().min(1) })
]);

export type AuthSource = z.infer<typeof AuthSourceSchema>;

export const ProviderKindSchema = z.enum([
  "openai",
  "anthropic",
  "openrouter",
  "ollama",
  "openai-compatible"
]);

export type ProviderKind = z.infer<typeof ProviderKindSchema>;

export const ProviderConfigSchema = z.object({
  type: ProviderKindSchema,
  base_url: z.string().url(),
  auth: AuthSourceSchema,
  catalog: z
    .object({
      source: z.enum(["static", "remote", "hybrid"])
    })
    .default({ source: "hybrid" })
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ModelProfileConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  label: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_output_tokens: z.number().int().positive().optional()
});

export type ModelProfileConfig = z.infer<typeof ModelProfileConfigSchema>;
```

- [ ] **Step 7: Export shared API**

Create `packages/shared/src/index.ts`:

```ts
export * from "./ids.js";
export * from "./runtime/contracts.js";
export * from "./runtime/events.js";
export * from "./config/types.js";
```

- [ ] **Step 8: Install workspace dependencies**

Run:

```bash
pnpm install
```

Expected:

```text
Done in
```

- [ ] **Step 9: Build shared package**

Run:

```bash
pnpm --filter @lingshu/shared build
```

Expected:

```text
Done
```

- [ ] **Step 10: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected:

```text
@lingshu/shared typecheck
```

with exit code 0.

- [ ] **Step 11: Commit shared contracts**

Run:

```bash
git add packages/shared package.json pnpm-lock.yaml
git commit -m "feat: 添加灵枢共享运行时契约"
```

---

## Task 3: Daemon Config Loader

**Files:**

- Create: `apps/daemon/package.json`
- Create: `apps/daemon/tsconfig.json`
- Create: `apps/daemon/src/modules/config/configSchema.ts`
- Create: `apps/daemon/src/modules/config/defaultConfig.ts`
- Create: `apps/daemon/src/modules/config/configPaths.ts`
- Create: `apps/daemon/src/modules/config/loadConfig.ts`
- Create: `apps/daemon/tests/configSchema.test.ts`
- Create: `apps/daemon/tests/loadConfig.test.ts`
- Test: `pnpm --filter @lingshu/daemon test`

- [ ] **Step 1: Create daemon package manifest**

Create `apps/daemon/package.json`:

```json
{
  "name": "@lingshu/daemon",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run apps/daemon/tests"
  },
  "dependencies": {
    "@lingshu/shared": "workspace:*",
    "@iarna/toml": "^2.2.5",
    "fastify": "^5.0.0",
    "ws": "^8.18.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create daemon tsconfig**

Create `apps/daemon/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "references": [{ "path": "../../packages/shared" }]
}
```

- [ ] **Step 3: Write failing config schema tests**

Create `apps/daemon/tests/configSchema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LingshuConfigSchema } from "../src/modules/config/configSchema.js";

describe("LingshuConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const parsed = LingshuConfigSchema.parse({
      version: 1,
      app: { default_profile: "fast" },
      providers: {
        local: {
          type: "ollama",
          base_url: "http://127.0.0.1:11434",
          auth: { source: "none" },
          catalog: { source: "remote" }
        }
      },
      profiles: {
        fast: {
          provider: "local",
          model: "llama3.2",
          label: "本地快速模型"
        }
      },
      agents: {
        default: { profile: "fast" }
      }
    });

    expect(parsed.app.default_profile).toBe("fast");
    expect(parsed.providers.local.type).toBe("ollama");
    expect(parsed.profiles.fast.provider).toBe("local");
  });

  it("rejects an invalid provider kind", () => {
    expect(() =>
      LingshuConfigSchema.parse({
        version: 1,
        providers: {
          bad: {
            type: "unknown",
            base_url: "https://example.com",
            auth: { source: "none" }
          }
        }
      })
    ).toThrow();
  });
});
```

- [ ] **Step 4: Run schema test to verify it fails**

Run:

```bash
pnpm --filter @lingshu/daemon test -- configSchema.test.ts
```

Expected:

```text
Failed to load url ../src/modules/config/configSchema.js
```

or equivalent failure because `configSchema.ts` does not exist yet.

- [ ] **Step 5: Implement config schema**

Create `apps/daemon/src/modules/config/configSchema.ts`:

```ts
import { AuthSourceSchema, ModelProfileConfigSchema, ProviderConfigSchema } from "@lingshu/shared";
import { z } from "zod";

export const AgentConfigSchema = z.object({
  profile: z.string().min(1)
});

export const LingshuConfigSchema = z.object({
  version: z.literal(1).default(1),
  app: z
    .object({
      default_profile: z.string().min(1).nullable().default(null)
    })
    .default({ default_profile: null }),
  trust: z
    .object({
      allow_workspace_providers: z.boolean().default(false),
      allow_insecure_http_hosts: z.array(z.string().min(1)).default(["127.0.0.1:11434", "localhost:11434"])
    })
    .default({
      allow_workspace_providers: false,
      allow_insecure_http_hosts: ["127.0.0.1:11434", "localhost:11434"]
    }),
  providers: z.record(z.string().min(1), ProviderConfigSchema).default({}),
  profiles: z.record(z.string().min(1), ModelProfileConfigSchema).default({}),
  agents: z.record(z.string().min(1), AgentConfigSchema).default({})
});

export type LingshuConfig = z.infer<typeof LingshuConfigSchema>;

export const SecretFileSchema = z
  .object({
    secrets: z.record(z.string().min(1), z.string().min(1)).default({})
  })
  .default({ secrets: {} });

export type SecretFile = z.infer<typeof SecretFileSchema>;

export { AuthSourceSchema };
```

- [ ] **Step 6: Add default config**

Create `apps/daemon/src/modules/config/defaultConfig.ts`:

```ts
import type { LingshuConfig } from "./configSchema.js";

export const defaultConfig: LingshuConfig = {
  version: 1,
  app: {
    default_profile: "local"
  },
  trust: {
    allow_workspace_providers: false,
    allow_insecure_http_hosts: ["127.0.0.1:11434", "localhost:11434"]
  },
  providers: {
    ollama_local: {
      type: "ollama",
      base_url: "http://127.0.0.1:11434",
      auth: { source: "none" },
      catalog: { source: "remote" }
    }
  },
  profiles: {
    local: {
      provider: "ollama_local",
      model: "llama3.2",
      label: "本地模型"
    }
  },
  agents: {
    default: {
      profile: "local"
    }
  }
};
```

- [ ] **Step 7: Add config paths**

Create `apps/daemon/src/modules/config/configPaths.ts`:

```ts
import os from "node:os";
import path from "node:path";

export interface ConfigPathSet {
  userConfig: string;
  userSecrets: string;
  codexConfig: string;
  workspaceShared: string;
  workspaceLocal: string;
}

export function getConfigPaths(workspaceDir: string, homeDir = os.homedir()): ConfigPathSet {
  return {
    userConfig: path.join(homeDir, ".lingshu", "config.toml"),
    userSecrets: path.join(homeDir, ".lingshu", "secrets.toml"),
    codexConfig: path.join(homeDir, ".codex", "config.toml"),
    workspaceShared: path.join(workspaceDir, ".lingshu.toml"),
    workspaceLocal: path.join(workspaceDir, ".lingshu.local.toml")
  };
}
```

- [ ] **Step 8: Write failing load config tests**

Create `apps/daemon/tests/loadConfig.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/modules/config/loadConfig.js";

async function makeTempDir(prefix: string): Promise<string> {
  return await fsTemp(path.join(os.tmpdir(), prefix));
}

async function fsTemp(prefix: string): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(prefix);
}

describe("loadConfig", () => {
  it("loads the built-in default config when no files exist", async () => {
    const homeDir = await makeTempDir("lingshu-home-");
    const workspaceDir = await makeTempDir("lingshu-workspace-");

    const result = await loadConfig({ homeDir, workspaceDir });

    expect(result.config.app.default_profile).toBe("local");
    expect(result.config.profiles.local.provider).toBe("ollama_local");
    expect(result.sources).toContain("built-in defaults");
  });

  it("merges user config and workspace local override by key", async () => {
    const homeDir = await makeTempDir("lingshu-home-");
    const workspaceDir = await makeTempDir("lingshu-workspace-");
    await mkdir(path.join(homeDir, ".lingshu"), { recursive: true });

    await writeFile(
      path.join(homeDir, ".lingshu", "config.toml"),
      `
version = 1

[app]
default_profile = "fast"

[providers.openai_main]
type = "openai"
base_url = "https://api.openai.com/v1"
auth = { source = "env", env = "OPENAI_API_KEY" }

[profiles.fast]
provider = "openai_main"
model = "gpt-test"
label = "快速模型"
`
    );

    await writeFile(
      path.join(workspaceDir, ".lingshu.local.toml"),
      `
version = 1

[profiles.fast]
provider = "openai_main"
model = "gpt-workspace"
label = "工作区快速模型"
`
    );

    const result = await loadConfig({ homeDir, workspaceDir });

    expect(result.config.app.default_profile).toBe("fast");
    expect(result.config.providers.openai_main.type).toBe("openai");
    expect(result.config.profiles.fast.model).toBe("gpt-workspace");
    expect(result.sources).toEqual([
      "built-in defaults",
      path.join(homeDir, ".lingshu", "config.toml"),
      path.join(workspaceDir, ".lingshu.local.toml")
    ]);
  });
});
```

- [ ] **Step 9: Run load config test to verify it fails**

Run:

```bash
pnpm --filter @lingshu/daemon test -- loadConfig.test.ts
```

Expected:

```text
Failed to load url ../src/modules/config/loadConfig.js
```

or equivalent failure because `loadConfig.ts` does not exist yet.

- [ ] **Step 10: Implement config loader**

Create `apps/daemon/src/modules/config/loadConfig.ts`:

```ts
import { readFile } from "node:fs/promises";
import * as TOML from "@iarna/toml";
import { defaultConfig } from "./defaultConfig.js";
import { getConfigPaths } from "./configPaths.js";
import { LingshuConfigSchema, type LingshuConfig } from "./configSchema.js";

export interface LoadConfigOptions {
  homeDir?: string;
  workspaceDir: string;
}

export interface LoadConfigResult {
  config: LingshuConfig;
  sources: string[];
}

export async function loadConfig(options: LoadConfigOptions): Promise<LoadConfigResult> {
  const paths = getConfigPaths(options.workspaceDir, options.homeDir);
  const orderedFiles = [paths.codexConfig, paths.userConfig, paths.workspaceShared, paths.workspaceLocal];
  const sources = ["built-in defaults"];
  let config = defaultConfig;

  for (const filePath of orderedFiles) {
    const loaded = await readTomlFile(filePath);
    if (!loaded) {
      continue;
    }

    config = mergeConfig(config, loaded);
    sources.push(filePath);
  }

  return {
    config: LingshuConfigSchema.parse(config),
    sources
  };
}

async function readTomlFile(filePath: string): Promise<Partial<LingshuConfig> | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return TOML.parse(raw) as Partial<LingshuConfig>;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function mergeConfig(base: LingshuConfig, override: Partial<LingshuConfig>): LingshuConfig {
  return LingshuConfigSchema.parse({
    ...base,
    ...override,
    app: {
      ...base.app,
      ...override.app
    },
    trust: {
      ...base.trust,
      ...override.trust
    },
    providers: {
      ...base.providers,
      ...override.providers
    },
    profiles: {
      ...base.profiles,
      ...override.profiles
    },
    agents: {
      ...base.agents,
      ...override.agents
    }
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
```

- [ ] **Step 11: Run daemon tests**

Run:

```bash
pnpm --filter @lingshu/daemon test
```

Expected:

```text
2 passed
```

or equivalent Vitest output with all daemon tests passing.

- [ ] **Step 12: Build daemon**

Run:

```bash
pnpm --filter @lingshu/daemon build
```

Expected:

```text
Done
```

- [ ] **Step 13: Commit config loader**

Run:

```bash
git add apps/daemon package.json pnpm-lock.yaml
git commit -m "feat: 添加灵枢 daemon 配置读取"
```

---

## Task 4: Daemon HTTP API and WebSocket Events

**Files:**

- Create: `apps/daemon/src/modules/events/eventBus.ts`
- Create: `apps/daemon/src/control-api/healthRoutes.ts`
- Create: `apps/daemon/src/control-api/modelRoutes.ts`
- Create: `apps/daemon/src/control-api/eventSocket.ts`
- Create: `apps/daemon/src/bootstrap/createDaemonApp.ts`
- Create: `apps/daemon/src/index.ts`
- Create: `apps/daemon/tests/healthRoutes.test.ts`
- Test: `pnpm --filter @lingshu/daemon test`, `pnpm --filter @lingshu/daemon build`

- [ ] **Step 1: Write failing health route test**

Create `apps/daemon/tests/healthRoutes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createDaemonApp } from "../src/bootstrap/createDaemonApp.js";

describe("daemon HTTP routes", () => {
  it("returns health status", async () => {
    const app = await createDaemonApp({
      workspaceDir: process.cwd(),
      startedAt: "2026-05-09T00:00:00.000Z"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: "lingshu-runtime",
      status: "ok",
      version: "0.1.0",
      startedAt: "2026-05-09T00:00:00.000Z"
    });
  });

  it("returns configured model profiles", async () => {
    const app = await createDaemonApp({
      workspaceDir: process.cwd(),
      startedAt: "2026-05-09T00:00:00.000Z"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/models/profiles"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      defaultProfile: "local",
      profiles: [
        {
          id: "local",
          provider: "ollama_local",
          model: "llama3.2",
          label: "本地模型",
          source: "config"
        }
      ]
    });
  });
});
```

- [ ] **Step 2: Run health route test to verify it fails**

Run:

```bash
pnpm --filter @lingshu/daemon test -- healthRoutes.test.ts
```

Expected:

```text
Failed to load url ../src/bootstrap/createDaemonApp.js
```

or equivalent failure because daemon app has not been created.

- [ ] **Step 3: Implement event bus**

Create `apps/daemon/src/modules/events/eventBus.ts`:

```ts
import { EventEmitter } from "node:events";
import type { RuntimeEvent } from "@lingshu/shared";

export class RuntimeEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: RuntimeEvent): void {
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: RuntimeEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
```

- [ ] **Step 4: Implement health routes**

Create `apps/daemon/src/control-api/healthRoutes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { HealthResponse } from "@lingshu/shared";

export interface HealthRouteOptions {
  startedAt: string;
}

export async function registerHealthRoutes(app: FastifyInstance, options: HealthRouteOptions): Promise<void> {
  app.get("/v1/health", async (): Promise<HealthResponse> => {
    return {
      service: "lingshu-runtime",
      status: "ok",
      version: "0.1.0",
      startedAt: options.startedAt
    };
  });
}
```

- [ ] **Step 5: Implement model routes**

Create `apps/daemon/src/control-api/modelRoutes.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { ModelProfilesResponse } from "@lingshu/shared";
import type { LingshuConfig } from "../modules/config/configSchema.js";

export async function registerModelRoutes(app: FastifyInstance, config: LingshuConfig): Promise<void> {
  app.get("/v1/models/profiles", async (): Promise<ModelProfilesResponse> => {
    return {
      defaultProfile: config.app.default_profile,
      profiles: Object.entries(config.profiles).map(([id, profile]) => ({
        id,
        provider: profile.provider,
        model: profile.model,
        label: profile.label ?? id,
        source: "config"
      }))
    };
  });
}
```

- [ ] **Step 6: Implement WebSocket event helper**

Create `apps/daemon/src/control-api/eventSocket.ts`:

```ts
import type { Server } from "node:http";
import { WebSocketServer } from "ws";
import type { RuntimeEventBus } from "../modules/events/eventBus.js";

export function attachEventSocket(server: Server, eventBus: RuntimeEventBus): WebSocketServer {
  const socketServer = new WebSocketServer({
    server,
    path: "/v1/ws"
  });

  socketServer.on("connection", (socket) => {
    const unsubscribe = eventBus.subscribe((event) => {
      socket.send(JSON.stringify(event));
    });

    socket.on("close", unsubscribe);
  });

  return socketServer;
}
```

- [ ] **Step 7: Implement daemon app factory**

Create `apps/daemon/src/bootstrap/createDaemonApp.ts`:

```ts
import fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoutes } from "../control-api/healthRoutes.js";
import { registerModelRoutes } from "../control-api/modelRoutes.js";
import { loadConfig } from "../modules/config/loadConfig.js";
import { RuntimeEventBus } from "../modules/events/eventBus.js";

export interface CreateDaemonAppOptions {
  workspaceDir: string;
  homeDir?: string;
  startedAt?: string;
}

export interface DaemonApp extends FastifyInstance {
  eventBus: RuntimeEventBus;
}

export async function createDaemonApp(options: CreateDaemonAppOptions): Promise<DaemonApp> {
  const app = fastify({ logger: false }) as DaemonApp;
  const startedAt = options.startedAt ?? new Date().toISOString();
  const eventBus = new RuntimeEventBus();
  const { config } = await loadConfig({
    workspaceDir: options.workspaceDir,
    homeDir: options.homeDir
  });

  app.eventBus = eventBus;

  await registerHealthRoutes(app, { startedAt });
  await registerModelRoutes(app, config);

  eventBus.publish({
    type: "runtime.ready",
    service: "lingshu-runtime",
    startedAt
  });
  eventBus.publish({
    type: "model.profiles_loaded",
    count: Object.keys(config.profiles).length
  });

  return app;
}
```

- [ ] **Step 8: Implement daemon entrypoint**

Create `apps/daemon/src/index.ts`:

```ts
import { createServer } from "node:http";
import { createDaemonApp } from "./bootstrap/createDaemonApp.js";
import { attachEventSocket } from "./control-api/eventSocket.js";

const port = Number(process.env.LINGSHU_RUNTIME_PORT ?? 4317);
const host = "127.0.0.1";
const workspaceDir = process.env.LINGSHU_WORKSPACE_DIR ?? process.cwd();

const app = await createDaemonApp({ workspaceDir });
const server = createServer((request, response) => {
  app.server.emit("request", request, response);
});

attachEventSocket(server, app.eventBus);

server.listen(port, host, () => {
  console.log(`lingshu-runtime listening on http://${host}:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
```

- [ ] **Step 9: Run daemon tests**

Run:

```bash
pnpm --filter @lingshu/daemon test
```

Expected:

```text
3 passed
```

or equivalent Vitest output with all daemon tests passing.

- [ ] **Step 10: Build daemon**

Run:

```bash
pnpm --filter @lingshu/daemon build
```

Expected:

```text
Done
```

- [ ] **Step 11: Smoke run daemon**

Run:

```bash
pnpm --filter @lingshu/daemon build
node apps/daemon/dist/index.js
```

Expected:

```text
lingshu-runtime listening on http://127.0.0.1:4317
```

Stop the process with Ctrl+C after confirming the line appears.

- [ ] **Step 12: Commit daemon API**

Run:

```bash
git add apps/daemon packages/shared package.json pnpm-lock.yaml
git commit -m "feat: 添加 daemon health 和模型接口"
```

---

## Task 5: Desktop App Shell and Runtime Client

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/main/main.ts`
- Create: `apps/desktop/src/preload/preload.ts`
- Create: `apps/desktop/src/renderer/api/runtimeClient.ts`
- Create: `apps/desktop/src/renderer/App.tsx`
- Create: `apps/desktop/src/renderer/main.tsx`
- Create: `apps/desktop/src/renderer/styles.css`
- Test: `pnpm --filter @lingshu/desktop build`, `pnpm typecheck`

- [ ] **Step 1: Create desktop package manifest**

Create `apps/desktop/package.json`:

```json
{
  "name": "@lingshu/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main/main.js",
  "scripts": {
    "build": "vite build && tsc -p tsconfig.json",
    "dev": "vite --host 127.0.0.1",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@lingshu/shared": "workspace:*",
    "@vitejs/plugin-react": "^5.0.0",
    "electron": "^37.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vite": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.9.0"
  }
}
```

- [ ] **Step 2: Create desktop tsconfig**

Create `apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node", "electron"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [{ "path": "../../packages/shared" }]
}
```

- [ ] **Step 3: Create Vite HTML entry**

Create `apps/desktop/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>灵枢 / Lingshu</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Implement runtime client**

Create `apps/desktop/src/renderer/api/runtimeClient.ts`:

```ts
import type { HealthResponse, ModelProfilesResponse, RuntimeEvent } from "@lingshu/shared";

const runtimeBaseUrl = "http://127.0.0.1:4317";
const runtimeSocketUrl = "ws://127.0.0.1:4317/v1/ws";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${runtimeBaseUrl}/v1/health`);
  if (!response.ok) {
    throw new Error(`Runtime health request failed: ${response.status}`);
  }

  return (await response.json()) as HealthResponse;
}

export async function fetchModelProfiles(): Promise<ModelProfilesResponse> {
  const response = await fetch(`${runtimeBaseUrl}/v1/models/profiles`);
  if (!response.ok) {
    throw new Error(`Runtime model profiles request failed: ${response.status}`);
  }

  return (await response.json()) as ModelProfilesResponse;
}

export function subscribeRuntimeEvents(onEvent: (event: RuntimeEvent) => void, onError: () => void): () => void {
  const socket = new WebSocket(runtimeSocketUrl);

  socket.addEventListener("message", (message) => {
    onEvent(JSON.parse(String(message.data)) as RuntimeEvent);
  });
  socket.addEventListener("error", onError);

  return () => socket.close();
}
```

- [ ] **Step 5: Implement React app**

Create `apps/desktop/src/renderer/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { HealthResponse, ModelProfileSummary, RuntimeEvent } from "@lingshu/shared";
import { fetchHealth, fetchModelProfiles, subscribeRuntimeEvents } from "./api/runtimeClient";
import "./styles.css";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [profiles, setProfiles] = useState<ModelProfileSummary[]>([]);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRuntimeState() {
      try {
        const [healthResponse, profileResponse] = await Promise.all([fetchHealth(), fetchModelProfiles()]);
        if (!active) {
          return;
        }

        setHealth(healthResponse);
        setProfiles(profileResponse.profiles);
        setError(null);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Runtime 连接失败");
        }
      }
    }

    void loadRuntimeState();

    const unsubscribe = subscribeRuntimeEvents(
      (event) => setEvents((current) => [event, ...current].slice(0, 20)),
      () => setError("Runtime 事件连接失败")
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <span className="brandMark">灵</span>
          <div>
            <h1>灵枢</h1>
            <p>Lingshu Runtime</p>
          </div>
        </div>

        <section className="statusPanel">
          <h2>Runtime</h2>
          <p className={health ? "statusOk" : "statusBad"}>{health ? "已连接" : "未连接"}</p>
          {health ? <p className="meta">启动时间：{new Date(health.startedAt).toLocaleString()}</p> : null}
          {error ? <p className="errorText">{error}</p> : null}
        </section>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h2>模型档位</h2>
            <p>第一阶段先读取配置并显示可用 profile。</p>
          </div>
        </header>

        <section className="profileGrid">
          {profiles.map((profile) => (
            <article className="profileCard" key={profile.id}>
              <strong>{profile.label}</strong>
              <span>{profile.provider}</span>
              <code>{profile.model}</code>
            </article>
          ))}
        </section>

        <section className="eventPanel">
          <h2>Runtime 事件</h2>
          {events.length === 0 ? <p className="meta">暂无事件</p> : null}
          {events.map((event, index) => (
            <pre key={`${event.type}-${index}`}>{JSON.stringify(event, null, 2)}</pre>
          ))}
        </section>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Add renderer entry**

Create `apps/desktop/src/renderer/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Add renderer styles**

Create `apps/desktop/src/renderer/styles.css`:

```css
:root {
  color: #172026;
  background: #f6f3ec;
  font-family:
    Inter, "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

body {
  margin: 0;
}

.appShell {
  display: grid;
  min-height: 100vh;
  grid-template-columns: 280px 1fr;
}

.sidebar {
  border-right: 1px solid #d8d2c5;
  background: #fffaf1;
  padding: 24px;
}

.brandBlock {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brandMark {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 8px;
  background: #264653;
  color: #ffffff;
  font-weight: 700;
}

.brandBlock h1,
.topbar h2,
.eventPanel h2,
.statusPanel h2 {
  margin: 0;
}

.brandBlock p,
.topbar p,
.meta {
  color: #6f6a60;
}

.statusPanel,
.eventPanel {
  margin-top: 28px;
}

.statusOk {
  color: #28704f;
  font-weight: 700;
}

.statusBad,
.errorText {
  color: #9d2f2f;
  font-weight: 700;
}

.content {
  padding: 28px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.profileGrid {
  display: grid;
  margin-top: 20px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.profileCard {
  display: grid;
  gap: 8px;
  border: 1px solid #d8d2c5;
  border-radius: 8px;
  background: #ffffff;
  padding: 16px;
}

.profileCard span {
  color: #45616f;
}

.profileCard code {
  overflow-wrap: anywhere;
  color: #5f4b32;
}

.eventPanel pre {
  overflow: auto;
  border: 1px solid #d8d2c5;
  border-radius: 8px;
  background: #ffffff;
  padding: 12px;
}
```

- [ ] **Step 8: Add Electron main**

Create `apps/desktop/src/main/main.ts`:

```ts
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    title: "灵枢 / Lingshu",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.LINGSHU_RENDERER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return;
  }

  await window.loadFile(path.join(__dirname, "../../index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
```

- [ ] **Step 9: Add preload**

Create `apps/desktop/src/preload/preload.ts`:

```ts
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("lingshu", {
  platform: process.platform
});
```

- [ ] **Step 10: Install dependencies**

Run:

```bash
pnpm install
```

Expected:

```text
Done in
```

- [ ] **Step 11: Build desktop**

Run:

```bash
pnpm --filter @lingshu/desktop build
```

Expected:

```text
vite
```

and exit code 0.

- [ ] **Step 12: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected:

```text
Done
```

with exit code 0.

- [ ] **Step 13: Commit desktop shell**

Run:

```bash
git add apps/desktop package.json pnpm-lock.yaml
git commit -m "feat: 添加灵枢桌面应用骨架"
```

---

## Task 6: Connect Desktop to Daemon Process

**Files:**

- Modify: `apps/desktop/src/main/main.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/daemon/src/index.ts`
- Test: `pnpm build`, manual dev smoke test

- [ ] **Step 1: Add daemon lifecycle to Electron main**

Modify `apps/desktop/src/main/main.ts` to this complete version:

```ts
import { app, BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let daemonProcess: ChildProcessWithoutNullStreams | null = null;

function startDaemon(): void {
  if (daemonProcess) {
    return;
  }

  const daemonEntry = path.resolve(__dirname, "../../../daemon/dist/index.js");
  daemonProcess = spawn(process.execPath, [daemonEntry], {
    env: {
      ...process.env,
      LINGSHU_WORKSPACE_DIR: process.cwd(),
      LINGSHU_RUNTIME_PORT: process.env.LINGSHU_RUNTIME_PORT ?? "4317"
    },
    stdio: "pipe"
  });

  daemonProcess.stdout.on("data", (chunk) => {
    console.log(`[lingshu-runtime] ${String(chunk).trim()}`);
  });

  daemonProcess.stderr.on("data", (chunk) => {
    console.error(`[lingshu-runtime] ${String(chunk).trim()}`);
  });

  daemonProcess.on("exit", () => {
    daemonProcess = null;
  });
}

function stopDaemon(): void {
  if (!daemonProcess) {
    return;
  }

  daemonProcess.kill("SIGTERM");
  daemonProcess = null;
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    title: "灵枢 / Lingshu",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.LINGSHU_RENDERER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    return;
  }

  await window.loadFile(path.join(__dirname, "../../index.html"));
}

app.whenReady().then(() => {
  startDaemon();
  return createWindow();
});

app.on("before-quit", stopDaemon);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
```

- [ ] **Step 2: Add desktop start script**

Modify `apps/desktop/package.json` scripts:

```json
{
  "scripts": {
    "build": "vite build && tsc -p tsconfig.json",
    "dev": "vite --host 127.0.0.1",
    "start": "electron dist/main/main.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Keep the rest of the file unchanged.

- [ ] **Step 3: Make daemon port conflict fail clearly**

Modify `apps/daemon/src/index.ts` to this complete version:

```ts
import { createServer } from "node:http";
import { createDaemonApp } from "./bootstrap/createDaemonApp.js";
import { attachEventSocket } from "./control-api/eventSocket.js";

const port = Number(process.env.LINGSHU_RUNTIME_PORT ?? 4317);
const host = "127.0.0.1";
const workspaceDir = process.env.LINGSHU_WORKSPACE_DIR ?? process.cwd();

const app = await createDaemonApp({ workspaceDir });
const server = createServer((request, response) => {
  app.server.emit("request", request, response);
});

attachEventSocket(server, app.eventBus);

server.on("error", (error) => {
  console.error(`lingshu-runtime failed to listen on ${host}:${port}`);
  console.error(error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`lingshu-runtime listening on http://${host}:${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
```

- [ ] **Step 4: Build all packages**

Run:

```bash
pnpm build
```

Expected:

```text
@lingshu/shared build
@lingshu/daemon build
@lingshu/desktop build
```

with exit code 0.

- [ ] **Step 5: Start desktop smoke test**

Run:

```bash
pnpm --filter @lingshu/desktop start
```

Expected:

```text
[lingshu-runtime] lingshu-runtime listening on http://127.0.0.1:4317
```

The Electron window should show:

- title/brand: `灵枢`
- Runtime status: `已连接`
- at least one model profile card: `本地模型`

Close the window after verifying.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test
```

Expected:

```text
all tests pass
```

- [ ] **Step 7: Commit daemon desktop connection**

Run:

```bash
git add apps/desktop apps/daemon package.json pnpm-lock.yaml
git commit -m "feat: 连接桌面应用和 runtime daemon"
```

---

## Task 7: Documentation and Phase 1 Verification

**Files:**

- Modify: `README.md`
- Create: `docs/architecture/phase-1-runtime.md`
- Test: `pnpm build`, `pnpm test`, `pnpm typecheck`

- [ ] **Step 1: Update README**

Modify `README.md`:

```md
# 灵枢 / Lingshu

灵枢是一个 Runtime-first 的桌面智能体软件。它把本地 Agent Runtime 作为核心，桌面 UI 和外部控制接口都是 Runtime 的客户端。

## Phase 1

Phase 1 目标：

- Electron 桌面壳能启动。
- 本地 Runtime Daemon 能启动。
- UI 能连接 Runtime。
- UI 能显示 Runtime 状态。
- UI 能显示配置中的模型 profile。

## 开发命令

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm --filter @lingshu/desktop start
```

## 配置路径

用户配置：

```text
%USERPROFILE%\.lingshu\config.toml
```

用户密钥：

```text
%USERPROFILE%\.lingshu\secrets.toml
```

工作区覆盖：

```text
<workspace>\.lingshu.toml
<workspace>\.lingshu.local.toml
```
```

- [ ] **Step 2: Add architecture note**

Create `docs/architecture/phase-1-runtime.md`:

```md
# Phase 1 Runtime Architecture

Phase 1 建立灵枢的最小 Runtime-first 架构。

## 进程关系

```text
Electron Main
  ├─ BrowserWindow / Renderer
  └─ Runtime Daemon child process
        ├─ HTTP API: /v1/health, /v1/models/profiles
        └─ WebSocket: /v1/ws
```

## 边界

- Renderer 只通过 HTTP/WebSocket 访问 Runtime。
- Electron Main 只负责启动和停止 daemon。
- Daemon 负责配置读取、模型 profile 暴露和事件发布。
- Shared package 负责跨进程契约。

## Phase 1 不包含

- 真实模型调用。
- ProviderAdapter。
- 多智能体并发。
- 本地 token 鉴权。
- MCP。

这些能力在后续阶段逐步加入。
```

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected:

```text
exit code 0
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm test
```

Expected:

```text
exit code 0
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected:

```text
exit code 0
```

- [ ] **Step 6: Confirm git status only contains docs**

Run:

```bash
git status --short
```

Expected before commit:

```text
 M README.md
?? docs/architecture/phase-1-runtime.md
```

- [ ] **Step 7: Commit docs**

Run:

```bash
git add README.md docs/architecture/phase-1-runtime.md
git commit -m "docs: 记录 phase 1 runtime 架构"
```

---

## Self-Review Checklist

Before executing this plan, confirm:

- Each task is independently reviewable.
- Task 1 creates only workspace infrastructure.
- Task 2 creates only shared contracts.
- Task 3 creates config loading and tests.
- Task 4 creates daemon API/event infrastructure.
- Task 5 creates the desktop UI shell.
- Task 6 connects desktop main to daemon lifecycle.
- Task 7 documents the delivered Phase 1 architecture.
- Phase 1 does not implement real model calls, provider adapters, multi-agent concurrency, MCP, or external pairing.
- Commands include expected results.
- Every implementation task includes tests or build verification.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-runtime-first-desktop-agent.md`.

Two execution options:

1. **Subagent-Driven（推荐）**：每个 task 派发新的子智能体，实现后做规格符合性审查和代码质量审查。
2. **Inline Execution**：在当前会话里按计划逐步执行，阶段性检查。

用户要求子智能体使用 `gpt-5.4` 且 `xhigh` reasoning。若选择 Subagent-Driven，调度时必须显式设置该模型和推理强度。
