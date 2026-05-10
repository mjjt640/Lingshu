import type {
  ModelProfileSummary,
  ProviderSummary,
  ResolvedModelProfile,
  TaskModelSnapshotResponse
} from "@lingshu/shared";
import {
  ModelProfileSummarySchema,
  ResolvedModelProfileSchema,
  TaskModelSnapshotResponseSchema
} from "@lingshu/shared";
import type { LingshuConfig } from "../config/configSchema.js";
import { createProviderRegistry } from "../providers/providerRegistry.js";
import type { ModelSelectionStore } from "./modelSelectionStore.js";
import { createModelSelectionStore } from "./modelSelectionStore.js";

export interface ModelProfileResolver {
  listProviderSummaries(): ProviderSummary[];
  listProfileSummaries(): ModelProfileSummary[];
  resolveProfile(profileId: string): ResolvedModelProfile;
  createTaskModelSnapshot(profileId?: string): TaskModelSnapshotResponse;
}

function cloneResolvedProfile(profile: ResolvedModelProfile): ResolvedModelProfile {
  return ResolvedModelProfileSchema.parse(structuredClone(profile));
}

export function createModelProfileResolver(
  config: LingshuConfig,
  selectionStore: ModelSelectionStore = createModelSelectionStore(config)
): ModelProfileResolver {
  const providerRegistry = createProviderRegistry(config.providers);

  function listProviderSummaries(): ProviderSummary[] {
    return providerRegistry.listProviderSummaries();
  }

  function listProfileSummaries(): ModelProfileSummary[] {
    return Object.entries(config.profiles).map(([profileId, profile]) => {
      const providerConfig = config.providers[profile.provider];
      const adapter = providerConfig
        ? providerRegistry.getAdapter(profile.provider)
        : null;

      return ModelProfileSummarySchema.parse({
        id: profileId,
        provider: profile.provider,
        model: profile.model,
        label: profile.label ?? profileId,
        source: "config",
        providerType: providerConfig?.type,
        capabilities: adapter?.getDefaultCapabilities()
      });
    });
  }

  function resolveProfile(profileId: string): ResolvedModelProfile {
    const profile = config.profiles[profileId];

    if (!profile) {
      throw new Error(`Model profile "${profileId}" was not found`);
    }

    const providerConfig = config.providers[profile.provider];

    if (!providerConfig) {
      throw new Error(
        `Model profile "${profileId}" references missing provider "${profile.provider}"`
      );
    }

    const adapter = providerRegistry.getAdapter(profile.provider);

    const parameters: ResolvedModelProfile["parameters"] = {};

    if (profile.temperature !== undefined) {
      parameters.temperature = profile.temperature;
    }

    if (profile.max_output_tokens !== undefined) {
      parameters.maxOutputTokens = profile.max_output_tokens;
    }

    return ResolvedModelProfileSchema.parse({
      id: profileId,
      label: profile.label ?? profileId,
      provider: adapter.summarizeProvider(profile.provider, providerConfig),
      model: profile.model,
      parameters,
      capabilities: adapter.getDefaultCapabilities(),
      source: "config"
    });
  }

  function createTaskModelSnapshot(profileId?: string): TaskModelSnapshotResponse {
    const selectedProfile = profileId ?? selectionStore.getSelectedProfile();

    if (!selectedProfile) {
      throw new Error('Model profile "null" was not found');
    }

    const resolvedProfile = cloneResolvedProfile(resolveProfile(selectedProfile));

    return TaskModelSnapshotResponseSchema.parse({
      profileId: selectedProfile,
      resolvedProfile,
      snapshottedAt: new Date().toISOString()
    });
  }

  return {
    listProviderSummaries,
    listProfileSummaries,
    resolveProfile,
    createTaskModelSnapshot
  };
}
