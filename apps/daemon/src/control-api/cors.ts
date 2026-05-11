import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const allowedOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);

const allowedMethods = "GET, POST, PATCH, OPTIONS";
const allowedHeaders = "content-type";
const controlApiPaths = new Set([
  "/v1/health",
  "/v1/providers",
  "/v1/models/profiles",
  "/v1/models/selection",
  "/v1/tasks/model-snapshot"
]);

export async function registerControlApiCors(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (!controlApiPaths.has(getRequestPathname(request))) {
      return;
    }

    const origin = getRequestOrigin(request);
    const isAllowedOrigin = origin !== undefined && allowedOrigins.has(origin);

    if (isAllowedOrigin) {
      applyCorsHeaders(reply, origin);
    }

    if (request.method === "OPTIONS") {
      if (isAllowedOrigin) {
        reply.header("Access-Control-Allow-Methods", allowedMethods);
        reply.header("Access-Control-Allow-Headers", allowedHeaders);
      }

      return reply.code(204).send();
    }
  });
}

function applyCorsHeaders(reply: FastifyReply, origin: string): void {
  reply.header("Access-Control-Allow-Origin", origin);
  appendVaryHeader(reply, "Origin");
}

function getRequestOrigin(request: FastifyRequest): string | undefined {
  const { origin } = request.headers;
  return typeof origin === "string" ? origin : undefined;
}

function getRequestPathname(request: FastifyRequest): string {
  return new URL(request.url, "http://localhost").pathname;
}

function appendVaryHeader(reply: FastifyReply, value: string): void {
  const current = reply.getHeader("Vary");
  if (current === undefined) {
    reply.header("Vary", value);
    return;
  }

  const existingValues = [current]
    .flat()
    .flatMap((headerValue) => String(headerValue).split(","))
    .map((headerValue) => headerValue.trim())
    .filter((headerValue) => headerValue.length > 0);
  const hasValue = existingValues.some((headerValue) => headerValue.toLowerCase() === value.toLowerCase());

  if (!hasValue) {
    existingValues.push(value);
  }

  reply.header("Vary", existingValues.join(", "));
}
