import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fastify from "fastify";
import { describe, expect, it } from "vitest";

import { createDaemonApp } from "../src/bootstrap/createDaemonApp.js";
import { registerControlApiCors } from "../src/control-api/cors.js";

async function createCorsAppWithExistingVaryHeader() {
  const app = fastify({ logger: false });

  app.addHook("onRequest", async (_, reply) => {
    reply.header("Vary", "Accept-Encoding");
  });
  await registerControlApiCors(app);
  app.get("/v1/health", async () => ({ ok: true }));

  return app;
}

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

  it("does not echo unapproved requested preflight headers", async () => {
    const app = await createTestDaemonApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/models/selection",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "authorization, x-custom"
      }
    });

    expect([200, 204]).toContain(response.statusCode);
    expect(response.headers["access-control-allow-headers"]).toBe("content-type");
  });

  it("preserves existing Vary values when adding Origin", async () => {
    const app = await createCorsAppWithExistingVaryHeader();

    const response = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: {
        origin: "http://127.0.0.1:5173"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.vary).toContain("Accept-Encoding");
    expect(response.headers.vary).toContain("Origin");
  });

  it("does not answer preflight requests for unknown v1 paths", async () => {
    const app = await createTestDaemonApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/unknown",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.statusCode).not.toBe(204);
  });

  it("does not answer preflight requests for the websocket endpoint", async () => {
    const app = await createTestDaemonApp();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/ws",
      headers: {
        origin: "http://127.0.0.1:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.statusCode).not.toBe(204);
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
