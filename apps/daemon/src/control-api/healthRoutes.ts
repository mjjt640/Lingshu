import type { HealthResponse } from "@lingshu/shared";
import type { FastifyInstance } from "fastify";

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
