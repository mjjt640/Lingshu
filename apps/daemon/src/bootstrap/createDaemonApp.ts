import fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoutes } from "../control-api/healthRoutes.js";
import { registerModelRoutes } from "../control-api/modelRoutes.js";
import { loadConfig } from "../modules/config/loadConfig.js";
import { RuntimeEventBus } from "../modules/events/eventBus.js";
import { createModelProfileResolver } from "../modules/models/modelProfileResolver.js";
import { createModelSelectionStore } from "../modules/models/modelSelectionStore.js";

export interface CreateDaemonAppOptions {
  workspaceDir: string;
  homeDir?: string;
  startedAt?: string;
}

export type DaemonApp = FastifyInstance & {
  eventBus: RuntimeEventBus;
};

export async function createDaemonApp(options: CreateDaemonAppOptions): Promise<DaemonApp> {
  const startedAt = options.startedAt ?? new Date().toISOString();
  const eventBus = new RuntimeEventBus();
  const app: DaemonApp = Object.assign(fastify({ logger: false }), { eventBus });
  const { config } = await loadConfig({
    workspaceDir: options.workspaceDir,
    homeDir: options.homeDir
  });
  const modelSelectionStore = createModelSelectionStore(config);
  const modelProfileResolver = createModelProfileResolver(config, modelSelectionStore);

  await registerHealthRoutes(app, { startedAt });
  await registerModelRoutes(app, {
    config,
    eventBus,
    resolver: modelProfileResolver,
    selectionStore: modelSelectionStore
  });

  eventBus.publish({
    type: "runtime.ready",
    service: "lingshu-runtime",
    startedAt
  });
  eventBus.publish({
    type: "model.profiles_loaded",
    count: Object.keys(config.profiles).length
  });

  return app;
}
