import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeEvent } from "@lingshu/shared";
import { createDaemonApp } from "../src/bootstrap/createDaemonApp.js";

async function createConfiguredDaemonApp(extraConfig = "") {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "lingshu-model-routes-"));
  const homeDir = path.join(testRoot, "home");
  const workspaceDir = path.join(testRoot, "workspace");

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
catalog = { source = "remote" }
wire_api = "responses"

[profiles.fast]
provider = "openai_main"
model = "gpt-4.1-mini"
label = "Fast cloud"
temperature = 0.2
max_output_tokens = 1024
reasoning_effort = "high"

${extraConfig}
`
  );

  const app = await createDaemonApp({
    homeDir,
    workspaceDir,
    startedAt: "2026-05-10T00:00:00.000Z"
  });

  return app;
}

function expectErrorBody(response: { json: () => unknown }): string {
  const body = response.json();
  expect(body).toEqual({
    error: expect.any(String)
  });
  return (body as { error: string }).error;
}

describe("model selection HTTP routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns configured provider summaries", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const app = await createConfiguredDaemonApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/providers"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      providers: expect.arrayContaining([
        {
          id: "ollama_local",
          type: "ollama",
          baseUrl: "http://127.0.0.1:11434",
          auth: { source: "none", status: "not_required" },
          catalog: { source: "remote" }
        },
        {
          id: "openai_main",
          type: "openai",
          baseUrl: "https://api.openai.com/v1",
          wireApi: "responses",
          auth: { source: "env", status: "missing" },
          catalog: { source: "remote" }
        }
      ])
    });
    expect(response.body).not.toContain("OPENAI_API_KEY");
  });

  it("returns model profiles with the selected profile", async () => {
    const app = await createConfiguredDaemonApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/models/profiles"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      defaultProfile: "fast",
      selectedProfile: "fast",
      profiles: expect.arrayContaining([
        expect.objectContaining({
          id: "local",
          provider: "ollama_local",
          model: "llama3.2",
          label: "本地模型",
          source: "config",
          providerType: "ollama"
        }),
        expect.objectContaining({
          id: "fast",
          provider: "openai_main",
          model: "gpt-4.1-mini",
          label: "Fast cloud",
          source: "config",
          providerType: "openai"
        })
      ])
    });
  });

  it("returns a JSON error when model profile summaries cannot be resolved", async () => {
    const app = await createConfiguredDaemonApp(`
[providers.unsupported_anthropic]
type = "anthropic"
base_url = "https://api.anthropic.com"
auth = { source = "none" }
catalog = { source = "remote" }

[profiles.unsupported]
provider = "unsupported_anthropic"
model = "claude-test"
`);

    const response = await app.inject({
      method: "GET",
      url: "/v1/models/profiles"
    });

    expect(response.statusCode).toBe(500);
    expect(expectErrorBody(response)).toBe(
      'Unsupported provider kind "anthropic" for provider "unsupported_anthropic"'
    );
  });

  it("returns the current selected profile and resolved profile", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const app = await createConfiguredDaemonApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/models/selection"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      selectedProfile: "fast",
      resolvedProfile: {
        id: "fast",
        label: "Fast cloud",
        provider: {
          id: "openai_main",
          type: "openai",
          baseUrl: "https://api.openai.com/v1",
          wireApi: "responses",
          auth: { source: "env", status: "missing" },
          catalog: { source: "remote" }
        },
        model: "gpt-4.1-mini",
        parameters: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          reasoningEffort: "high"
        },
        source: "config"
      }
    });
    expect(response.body).not.toContain("OPENAI_API_KEY");
  });

  it("switches the current profile and publishes model.switched", async () => {
    const app = await createConfiguredDaemonApp();
    const events: RuntimeEvent[] = [];
    const unsubscribe = app.eventBus.subscribe((event) => events.push(event));

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/models/selection",
      payload: {
        profileId: "local"
      }
    });
    unsubscribe();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      previousProfile: "fast",
      selectedProfile: "local",
      resolvedProfile: {
        id: "local",
        provider: {
          id: "ollama_local",
          type: "ollama"
        },
        model: "llama3.2"
      }
    });

    const selectionResponse = await app.inject({
      method: "GET",
      url: "/v1/models/selection"
    });
    expect(selectionResponse.json()).toMatchObject({
      selectedProfile: "local",
      resolvedProfile: {
        id: "local",
        provider: {
          id: "ollama_local"
        }
      }
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "model.switched",
        previousProfile: "fast",
        currentProfile: "local",
        provider: "ollama_local",
        model: "llama3.2"
      })
    );
  });

  it("does not change selection or publish model.switched when the target profile cannot resolve", async () => {
    const app = await createConfiguredDaemonApp(`
[profiles.broken]
provider = "missing_provider"
model = "gpt-broken"
`);
    const events: RuntimeEvent[] = [];
    const unsubscribe = app.eventBus.subscribe((event) => events.push(event));

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/models/selection",
      payload: {
        profileId: "broken"
      }
    });
    unsubscribe();

    expect(response.statusCode).toBe(500);
    expect(expectErrorBody(response)).toBe(
      'Model profile "broken" references missing provider "missing_provider"'
    );
    expect(events).not.toContainEqual(
      expect.objectContaining({
        type: "model.switched"
      })
    );

    const selectionResponse = await app.inject({
      method: "GET",
      url: "/v1/models/selection"
    });

    expect(selectionResponse.statusCode).toBe(200);
    expect(selectionResponse.json()).toMatchObject({
      selectedProfile: "fast",
      resolvedProfile: {
        id: "fast",
        provider: {
          id: "openai_main"
        }
      }
    });
  });

  it("returns 400 JSON errors for invalid model selection patch bodies", async () => {
    const app = await createConfiguredDaemonApp();

    const missingProfileResponse = await app.inject({
      method: "PATCH",
      url: "/v1/models/selection",
      payload: {}
    });
    const extraFieldResponse = await app.inject({
      method: "PATCH",
      url: "/v1/models/selection",
      payload: {
        profileId: "local",
        extra: true
      }
    });

    expect(missingProfileResponse.statusCode).toBe(400);
    expect(expectErrorBody(missingProfileResponse)).not.toHaveLength(0);
    expect(extraFieldResponse.statusCode).toBe(400);
    expect(expectErrorBody(extraFieldResponse)).not.toHaveLength(0);
  });

  it("returns 404 with a clear JSON error when switching to an unknown profile", async () => {
    const app = await createConfiguredDaemonApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/models/selection",
      payload: {
        profileId: "missing"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: 'Model profile "missing" was not found'
    });
  });

  it("captures the selected profile for a future task model snapshot", async () => {
    const app = await createConfiguredDaemonApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/tasks/model-snapshot",
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      profileId: "fast",
      resolvedProfile: {
        id: "fast",
        provider: {
          id: "openai_main"
        },
        model: "gpt-4.1-mini"
      }
    });
  });

  it("returns a 400 JSON error for invalid task model snapshot bodies", async () => {
    const app = await createConfiguredDaemonApp();

    const response = await app.inject({
      method: "POST",
      url: "/v1/tasks/model-snapshot",
      payload: {
        profileId: "fast",
        extra: true
      }
    });

    expect(response.statusCode).toBe(400);
    expect(expectErrorBody(response)).not.toHaveLength(0);
  });

  it("keeps a snapshot created before a switch pointed at the old profile", async () => {
    const app = await createConfiguredDaemonApp();

    const oldSnapshotResponse = await app.inject({
      method: "POST",
      url: "/v1/tasks/model-snapshot",
      payload: {}
    });
    await app.inject({
      method: "PATCH",
      url: "/v1/models/selection",
      payload: {
        profileId: "local"
      }
    });
    const newSnapshotResponse = await app.inject({
      method: "POST",
      url: "/v1/tasks/model-snapshot",
      payload: {}
    });

    const oldSnapshot = oldSnapshotResponse.json();
    const newSnapshot = newSnapshotResponse.json();

    expect(oldSnapshot.profileId).toBe("fast");
    expect(oldSnapshot.resolvedProfile.id).toBe("fast");
    expect(oldSnapshot.resolvedProfile.provider.id).toBe("openai_main");
    expect(newSnapshot.profileId).toBe("local");
    expect(newSnapshot.resolvedProfile.id).toBe("local");
    expect(newSnapshot.resolvedProfile.provider.id).toBe("ollama_local");
  });
});
