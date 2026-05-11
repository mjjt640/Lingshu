import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeEvent } from "@lingshu/shared";
import { createDaemonApp } from "../src/bootstrap/createDaemonApp.js";

async function createConfiguredDaemonApp() {
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
`
  );

  const app = await createDaemonApp({
    homeDir,
    workspaceDir,
    startedAt: "2026-05-10T00:00:00.000Z"
  });

  return app;
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
    expect(response.json()).toEqual({
      providers: [
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
      ]
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
      profiles: [
        {
          id: "local",
          provider: "ollama_local",
          model: "llama3.2",
          label: "本地模型",
          source: "config",
          providerType: "ollama"
        },
        {
          id: "fast",
          provider: "openai_main",
          model: "gpt-4.1-mini",
          label: "Fast cloud",
          source: "config",
          providerType: "openai"
        }
      ]
    });
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
