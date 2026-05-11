import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createDaemonApp } from "../src/bootstrap/createDaemonApp.js";

async function createTestDaemonApp() {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "lingshu-cors-routes-"));

  return createDaemonApp({
    homeDir: path.join(testRoot, "home"),
    workspaceDir: path.join(testRoot, "workspace"),
    startedAt: "2026-05-11T00:00:00.000Z"
  });
}

describe("control API CORS", () => {
  it("allows the Vite desktop origin on v1 GET responses", async () => {
    const app = await createTestDaemonApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: {
        origin: "http://127.0.0.1:5173"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(response.headers.vary).toContain("Origin");
  });

  it("answers PATCH preflight requests for model selection", async () => {
    const app = await createTestDaemonApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/models/selection",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type"
      }
    });

    expect([200, 204]).toContain(response.statusCode);
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("content-type");
    expect(response.headers.vary).toContain("Origin");
  });

  it("does not allow remote browser origins", async () => {
    const app = await createTestDaemonApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: {
        origin: "https://evil.example"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
