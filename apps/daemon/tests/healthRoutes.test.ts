import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDaemonApp } from "../src/bootstrap/createDaemonApp.js";

async function createIsolatedConfigDirs(): Promise<{
  homeDir: string;
  workspaceDir: string;
}> {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "lingshu-daemon-test-"));

  return {
    homeDir: path.join(testRoot, "home"),
    workspaceDir: path.join(testRoot, "workspace")
  };
}

describe("daemon HTTP routes", () => {
  it("returns health status", async () => {
    const { homeDir, workspaceDir } = await createIsolatedConfigDirs();
    const app = await createDaemonApp({
      homeDir,
      workspaceDir,
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
    const { homeDir, workspaceDir } = await createIsolatedConfigDirs();
    const app = await createDaemonApp({
      homeDir,
      workspaceDir,
      startedAt: "2026-05-09T00:00:00.000Z"
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/models/profiles"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      defaultProfile: "local",
      selectedProfile: "local",
      profiles: [
        {
          id: "local",
          provider: "ollama_local",
          model: "llama3.2",
          label: "本地模型",
          source: "config",
          providerType: "ollama"
        }
      ]
    });
  });
});
