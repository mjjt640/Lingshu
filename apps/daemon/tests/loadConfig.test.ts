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

  it("loads screenshot-style Codex model config before final Lingshu schema parsing", async () => {
    const homeDir = await makeTempDir("lingshu-home-");
    const workspaceDir = await makeTempDir("lingshu-workspace-");
    await mkdir(path.join(homeDir, ".codex"), { recursive: true });

    await writeFile(
      path.join(homeDir, ".codex", "config.toml"),
      `
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
`
    );

    const result = await loadConfig({ homeDir, workspaceDir });

    expect(result.config.providers.OpenAI).toEqual({
      type: "openai-compatible",
      base_url: "https://subapi.muxueai.pro",
      wire_api: "responses",
      auth: { source: "env", env: "OPENAI_API_KEY" },
      catalog: { source: "hybrid" }
    });
    expect(result.config.profiles.primary).toEqual({
      provider: "OpenAI",
      model: "gpt-5.4",
      label: "Primary",
      reasoning_effort: "xhigh"
    });
    expect(result.config.profiles.review).toEqual({
      provider: "OpenAI",
      model: "gpt-5.4",
      label: "Review",
      reasoning_effort: "xhigh"
    });
    expect(result.config.app.default_profile).toBe("primary");
    expect(result.sources).toContain(path.join(homeDir, ".codex", "config.toml"));
  });

  it("keeps native Lingshu profiles from being overwritten by Codex compatibility profiles", async () => {
    const homeDir = await makeTempDir("lingshu-home-");
    const workspaceDir = await makeTempDir("lingshu-workspace-");
    await mkdir(path.join(homeDir, ".codex"), { recursive: true });
    await mkdir(path.join(homeDir, ".lingshu"), { recursive: true });

    await writeFile(
      path.join(homeDir, ".codex", "config.toml"),
      `
model_provider = "OpenAI"
model = "gpt-5.4"
review_model = "gpt-5.4"
model_reasoning_effort = "xhigh"

[model_providers.OpenAI]
name = "OpenAI"
base_url = "https://subapi.muxueai.pro"
wire_api = "responses"
requires_openai_auth = true
`
    );

    await writeFile(
      path.join(homeDir, ".lingshu", "config.toml"),
      `
version = 1

[app]
default_profile = "primary"

[providers.OpenAI]
type = "openai"
base_url = "https://api.openai.com/v1"
auth = { source = "runtime_secret", id = "native-openai-key" }
catalog = { source = "remote" }
wire_api = "chat_completions"

[providers.relay]
type = "openai-compatible"
base_url = "https://relay.example.test/v1"
auth = { source = "none" }
catalog = { source = "static" }

[profiles.primary]
provider = "relay"
model = "native-primary"
label = "Native Primary"
reasoning_effort = "low"

[profiles.extra]
provider = "relay"
model = "native-extra"
`
    );

    const result = await loadConfig({ homeDir, workspaceDir });

    expect(result.config.providers.OpenAI).toEqual({
      type: "openai",
      base_url: "https://api.openai.com/v1",
      auth: { source: "runtime_secret", id: "native-openai-key" },
      catalog: { source: "remote" },
      wire_api: "chat_completions"
    });
    expect(result.config.profiles.primary).toEqual({
      provider: "relay",
      model: "native-primary",
      label: "Native Primary",
      reasoning_effort: "low"
    });
    expect(result.config.profiles.review).toEqual({
      provider: "OpenAI",
      model: "gpt-5.4",
      label: "Review",
      reasoning_effort: "xhigh"
    });
    expect(result.config.profiles.extra.model).toBe("native-extra");
  });
});
