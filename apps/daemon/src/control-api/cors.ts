import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

const allowedOrigins = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173"
]);

const allowedMethods = "GET, POST, PATCH, OPTIONS";
const allowedHeaders = "content-type";

export async function registerControlApiCors(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) {
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
        reply.header("Access-Control-Allow-Headers", getRequestedHeaders(request) ?? allowedHeaders);
      }

      return reply.code(204).send();
    }
  });
}

function applyCorsHeaders(reply: FastifyReply, origin: string): void {
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Vary", "Origin");
}

function getRequestOrigin(request: FastifyRequest): string | undefined {
  const { origin } = request.headers;
  return typeof origin === "string" ? origin : undefined;
}

function getRequestedHeaders(request: FastifyRequest): string | undefined {
  const requestedHeaders = request.headers["access-control-request-headers"];
  return typeof requestedHeaders === "string" ? requestedHeaders : undefined;
}
