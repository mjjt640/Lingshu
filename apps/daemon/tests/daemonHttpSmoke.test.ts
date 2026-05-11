import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const daemonRoot = resolve(repoRoot, "apps/daemon");
const daemonEntrypoint = resolve(repoRoot, "apps/daemon/src/index.ts");

describe("daemon real HTTP startup", () => {
  it("serves health and model profiles over the daemon entrypoint", async () => {
    const port = await getAvailablePort();
    const configDirs = await createIsolatedConfigDirs();
    const daemon = startDaemonProcess(port, configDirs);

    try {
      await waitForOutput(daemon, "lingshu-runtime listening", 10_000);

      const baseUrl = `http://127.0.0.1:${port}`;
      const healthResponse = await fetchJson(`${baseUrl}/v1/health`);
      const providersResponse = await fetchJson(`${baseUrl}/v1/providers`);
      const profilesResponse = await fetchJson(`${baseUrl}/v1/models/profiles`);
      const selectionResponse = await fetchJson(`${baseUrl}/v1/models/selection`);
      const snapshotResponse = await fetchJson(`${baseUrl}/v1/tasks/model-snapshot`, {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "Content-Type": "application/json"
        }
      });

      expect(healthResponse).toMatchObject({
        service: "lingshu-runtime",
        status: "ok",
        version: "0.1.0"
      });
      expect(typeof healthResponse.startedAt).toBe("string");
      expect(providersResponse).toMatchObject({
        providers: [
          {
            id: "ollama_local",
            type: "ollama"
          }
        ]
      });
      expect(profilesResponse).toMatchObject({
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
      expect(selectionResponse).toMatchObject({
        selectedProfile: "local",
        resolvedProfile: {
          id: "local"
        }
      });
      expect(snapshotResponse).toMatchObject({
        profileId: "local",
        resolvedProfile: {
          id: "local"
        }
      });
    } finally {
      await stopDaemonProcess(daemon);
    }
  }, 15_000);
});

async function createIsolatedConfigDirs(): Promise<{
  homeDir: string;
  workspaceDir: string;
}> {
  const testRoot = await mkdtemp(resolve(os.tmpdir(), "lingshu-daemon-smoke-"));

  return {
    homeDir: resolve(testRoot, "home"),
    workspaceDir: resolve(testRoot, "workspace")
  };
}

function startDaemonProcess(
  port: number,
  configDirs: { homeDir: string; workspaceDir: string }
): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["--import", "tsx", daemonEntrypoint], {
    cwd: daemonRoot,
    env: {
      ...process.env,
      LINGSHU_RUNTIME_PORT: String(port),
      LINGSHU_HOME_DIR: configDirs.homeDir,
      LINGSHU_WORKSPACE_DIR: configDirs.workspaceDir,
      NO_COLOR: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function getAvailablePort(): Promise<number> {
  const server = createServer();
  await listen(server, 0, "127.0.0.1");
  const address = server.address();
  await closeServer(server);

  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate a local test port.");
  }

  return address.port;
}

async function listen(server: Server, port: number, host: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  return (await response.json()) as Record<string, unknown>;
}

async function waitForOutput(
  daemon: ChildProcessWithoutNullStreams,
  expectedOutput: string,
  timeoutMs: number
): Promise<void> {
  let output = "";

  const appendOutput = (chunk: Buffer): void => {
    output += chunk.toString("utf8");
  };

  daemon.stdout.on("data", appendOutput);
  daemon.stderr.on("data", appendOutput);

  try {
    const startedAt = Date.now();
    while (!output.includes(expectedOutput)) {
      if (daemon.exitCode !== null) {
        throw new Error(`Daemon exited before startup.\n${output}`);
      }

      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`Timed out waiting for daemon startup.\n${output}`);
      }

      await delay(50);
    }
  } finally {
    daemon.stdout.off("data", appendOutput);
    daemon.stderr.off("data", appendOutput);
  }
}

async function stopDaemonProcess(daemon: ChildProcessWithoutNullStreams): Promise<void> {
  if (daemon.exitCode !== null) {
    return;
  }

  daemon.kill("SIGTERM");

  const exited = once(daemon, "exit").then(() => true);
  const timedOut = delay(3_000).then(() => false);

  if (!(await Promise.race([exited, timedOut]))) {
    daemon.kill("SIGKILL");
    await once(daemon, "exit");
  }
}
