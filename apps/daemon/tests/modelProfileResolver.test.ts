import { afterEach, describe, expect, it, vi } from "vitest";

import type { LingshuConfig } from "../src/modules/config/configSchema.js";
import { createModelProfileResolver } from "../src/modules/models/modelProfileResolver.js";
import { createModelSelectionStore } from "../src/modules/models/modelSelectionStore.js";

function createConfig(): LingshuConfig {
  return {
    version: 1,
    app: { default_profile: "fast" },
    trust: {
      allow_workspace_providers: false,
      allow_insecure_http_hosts: ["127.0.0.1:11434"]
    },
    providers: {
      openai_main: {
        type: "openai",
        base_url: "https://api.openai.com/v1",
        auth: { source: "env", env: "OPENAI_API_KEY" },
        catalog: { source: "remote" }
      },
      ollama_local: {
        type: "ollama",
        base_url: "http://127.0.0.1:11434",
        auth: { source: "none" },
        catalog: { source: "remote" }
      }
    },
    profiles: {
      fast: {
        provider: "openai_main",
        model: "gpt-4.1-mini",
        label: "Fast cloud",
        temperature: 0.2,
        max_output_tokens: 1024
      },
      local: {
        provider: "ollama_local",
        model: "llama3.2"
      }
    },
    agents: {
      default: { profile: "fast" }
    }
  };
}

describe("ModelProfileResolver", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves a valid profile to provider id, provider type, model, label, parameters, and capabilities", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const resolver = createModelProfileResolver(createConfig());

    const resolved = resolver.resolveProfile("fast");

    expect(resolved).toEqual({
      id: "fast",
      label: "Fast cloud",
      provider: {
        id: "openai_main",
        type: "openai",
        baseUrl: "https://api.openai.com/v1",
        auth: { source: "env", status: "missing" },
        catalog: { source: "remote" }
      },
      model: "gpt-4.1-mini",
      parameters: {
        temperature: 0.2,
        maxOutputTokens: 1024
      },
      capabilities: {
        supportsStreaming: true,
        supportsTools: true,
        supportsVision: true,
        supportsJson: true,
        supportsReasoning: true,
        supportsSystemPrompt: true,
        supportsLocalExecution: false
      },
      source: "config"
    });
  });

  it("throws a clear error when a profile references a missing provider", () => {
    const config = createConfig();
    config.profiles.broken = {
      provider: "missing_provider",
      model: "gpt-4.1-mini"
    };
    const resolver = createModelProfileResolver(config);

    expect(() => resolver.resolveProfile("broken")).toThrow(
      'Model profile "broken" references missing provider "missing_provider"'
    );
  });

  it("throws a clear error when a profile is missing", () => {
    const resolver = createModelProfileResolver(createConfig());

    expect(() => resolver.resolveProfile("missing")).toThrow(
      'Model profile "missing" was not found'
    );
  });

  it("creates immutable task model snapshots that do not change after selection switches", () => {
    const config = createConfig();
    const selectionStore = createModelSelectionStore(config);
    const resolver = createModelProfileResolver(config, selectionStore);

    const snapshot = resolver.createTaskModelSnapshot();
    const switchResult = selectionStore.switchProfile("local");

    expect(switchResult).toEqual({
      previousProfile: "fast",
      selectedProfile: "local"
    });
    expect(snapshot.profileId).toBe("fast");
    expect(snapshot.resolvedProfile.id).toBe("fast");
    expect(snapshot.resolvedProfile.provider.id).toBe("openai_main");

    const currentSnapshot = resolver.createTaskModelSnapshot();
    expect(currentSnapshot.profileId).toBe("local");
    expect(currentSnapshot.resolvedProfile.id).toBe("local");
    expect(snapshot.resolvedProfile).not.toBe(currentSnapshot.resolvedProfile);
  });

  it("initializes selected profile from default, first configured profile, or null", () => {
    const defaultStore = createModelSelectionStore(createConfig());
    expect(defaultStore.getSelectedProfile()).toBe("fast");

    const firstProfileConfig = createConfig();
    firstProfileConfig.app.default_profile = null;
    const firstProfileStore = createModelSelectionStore(firstProfileConfig);
    expect(firstProfileStore.getSelectedProfile()).toBe("fast");

    const emptyConfig = createConfig();
    emptyConfig.app.default_profile = null;
    emptyConfig.profiles = {};
    const emptyStore = createModelSelectionStore(emptyConfig);
    expect(emptyStore.getSelectedProfile()).toBeNull();
  });

  it("switches only to valid profiles", () => {
    const selectionStore = createModelSelectionStore(createConfig());

    expect(() => selectionStore.switchProfile("missing")).toThrow(
      'Model profile "missing" was not found'
    );
    expect(selectionStore.getSelectedProfile()).toBe("fast");
  });

  it("keeps profile validity fixed after the selection store is created", () => {
    const config = createConfig();
    const selectionStore = createModelSelectionStore(config);

    config.profiles.added_later = {
      provider: "ollama_local",
      model: "llama3.2"
    };
    delete config.profiles.local;

    expect(() => selectionStore.switchProfile("added_later")).toThrow(
      'Model profile "added_later" was not found'
    );

    expect(selectionStore.switchProfile("local")).toEqual({
      previousProfile: "fast",
      selectedProfile: "local"
    });
  });
});
