import type {
  ModelProfilesResponse,
  ModelSelectionResponse,
  ProvidersResponse,
  SwitchModelProfileResponse,
  TaskModelSnapshotResponse
} from "@lingshu/shared";
import {
  RuntimeEventSchema,
  SwitchModelProfileRequestSchema,
  TaskModelSnapshotRequestSchema
} from "@lingshu/shared";
import type { FastifyInstance } from "fastify";
import type { LingshuConfig } from "../modules/config/configSchema.js";
import type { RuntimeEventBus } from "../modules/events/eventBus.js";
import type { ModelProfileResolver } from "../modules/models/modelProfileResolver.js";
import type { ModelSelectionStore } from "../modules/models/modelSelectionStore.js";

export interface ModelRouteOptions {
  config: LingshuConfig;
  eventBus: RuntimeEventBus;
  resolver: ModelProfileResolver;
  selectionStore: ModelSelectionStore;
}

export async function registerModelRoutes(
  app: FastifyInstance,
  options: ModelRouteOptions
): Promise<void> {
  const { config, eventBus, resolver, selectionStore } = options;

  app.get("/v1/providers", async (_, reply): Promise<ProvidersResponse | { error: string }> => {
    try {
      return {
        providers: resolver.listProviderSummaries()
      };
    } catch (error) {
      reply.code(500);
      return { error: getErrorMessage(error) };
    }
  });

  app.get("/v1/models/profiles", async (_, reply): Promise<ModelProfilesResponse | { error: string }> => {
    try {
      return {
        defaultProfile: config.app.default_profile,
        selectedProfile: selectionStore.getSelectedProfile(),
        profiles: resolver.listProfileSummaries()
      };
    } catch (error) {
      reply.code(500);
      return { error: getErrorMessage(error) };
    }
  });

  app.get("/v1/models/selection", async (_, reply): Promise<ModelSelectionResponse | { error: string }> => {
    try {
      const selectedProfile = selectionStore.getSelectedProfile();

      return {
        selectedProfile,
        resolvedProfile: selectedProfile ? resolver.resolveProfile(selectedProfile) : null
      };
    } catch (error) {
      reply.code(isMissingModelProfileError(error) ? 404 : 500);
      return { error: getErrorMessage(error) };
    }
  });

  app.patch("/v1/models/selection", async (request, reply): Promise<SwitchModelProfileResponse | { error: string }> => {
    const parsed = SwitchModelProfileRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues[0]?.message ?? "Invalid request body" };
    }

    try {
      const resolvedProfile = resolver.resolveProfile(parsed.data.profileId);
      const switchResult = selectionStore.switchProfile(parsed.data.profileId);
      const switchedAt = new Date().toISOString();

      publishModelSwitchedBestEffort(
        eventBus,
        RuntimeEventSchema.parse({
          type: "model.switched",
          previousProfile: switchResult.previousProfile,
          currentProfile: switchResult.selectedProfile,
          provider: resolvedProfile.provider.id,
          model: resolvedProfile.model,
          switchedAt
        })
      );

      return {
        ...switchResult,
        resolvedProfile,
        switchedAt
      };
    } catch (error) {
      reply.code(isMissingModelProfileError(error) ? 404 : 500);
      return { error: getErrorMessage(error) };
    }
  });

  app.post("/v1/tasks/model-snapshot", async (request, reply): Promise<TaskModelSnapshotResponse | { error: string }> => {
    const parsed = TaskModelSnapshotRequestSchema.safeParse(request.body ?? {});

    if (!parsed.success) {
      reply.code(400);
      return { error: parsed.error.issues[0]?.message ?? "Invalid request body" };
    }

    try {
      return resolver.createTaskModelSnapshot(parsed.data.profileId);
    } catch (error) {
      reply.code(isMissingModelProfileError(error) ? 404 : 500);
      return { error: getErrorMessage(error) };
    }
  });
}

function publishModelSwitchedBestEffort(
  eventBus: RuntimeEventBus,
  event: ReturnType<typeof RuntimeEventSchema.parse>
): void {
  try {
    eventBus.publish(event);
  } catch {
    // Event delivery is best-effort; selection state has already changed.
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected model route error";
}

function isMissingModelProfileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^Model profile ".+" was not found$/.test(error.message)
  );
}
