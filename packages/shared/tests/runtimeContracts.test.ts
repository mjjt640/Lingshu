import { describe, expect, it } from "vitest";

import {
  ModelProfileSummarySchema,
  ModelSelectionResponseSchema,
  ProviderSummarySchema,
  ProvidersResponseSchema,
  ResolvedModelProfileSchema,
  RuntimeEventSchema,
  SwitchModelProfileRequestSchema,
  SwitchModelProfileResponseSchema,
  TaskModelSnapshotRequestSchema,
  TaskModelSnapshotResponseSchema
} from "../src/index.js";

const capabilities = {
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: false,
  supportsJson: true,
  supportsReasoning: false,
  supportsSystemPrompt: true,
  supportsLocalExecution: false
};

const providerSummary = {
  id: "openai_main",
  type: "openai",
  baseUrl: "https://api.openai.com/v1",
  auth: {
    source: "env",
    status: "configured"
  },
  catalog: {
    source: "hybrid"
  }
};

const resolvedProfile = {
  id: "fast",
  label: "Fast",
  provider: providerSummary,
  model: "gpt-test",
  parameters: {
    temperature: 0.2,
    maxOutputTokens: 4096
  },
  capabilities,
  source: "config"
};

describe("runtime contract schemas", () => {
  it("accepts a Phase 1 model profile summary", () => {
    const parsed = ModelProfileSummarySchema.parse({
      id: "fast",
      provider: "openai_main",
      model: "gpt-test",
      label: "Fast",
      source: "config"
    });

    expect(parsed.id).toBe("fast");
  });

  it("accepts optional provider type and capabilities on model profile summaries", () => {
    const parsed = ModelProfileSummarySchema.parse({
      id: "fast",
      provider: "openai_main",
      model: "gpt-test",
      label: "Fast",
      source: "config",
      providerType: "openai",
      capabilities
    });

    expect(parsed.providerType).toBe("openai");
    expect(parsed.capabilities?.supportsTools).toBe(true);
  });

  it("rejects raw auth fields in provider summaries", () => {
    expect(() =>
      ProviderSummarySchema.parse({
        ...providerSummary,
        auth: {
          source: "env",
          status: "configured",
          env: "OPENAI_API_KEY"
        }
      })
    ).toThrow();
  });

  it("rejects provider summary base URLs with userinfo, query, or hash", () => {
    for (const baseUrl of [
      "https://token@example.com/v1",
      "https://api.openai.com/v1?api_key=secret",
      "https://api.openai.com/v1#secret"
    ]) {
      expect(() =>
        ProviderSummarySchema.parse({
          ...providerSummary,
          baseUrl
        })
      ).toThrow();
    }
  });

  it("accepts model switched runtime events", () => {
    const parsed = RuntimeEventSchema.parse({
      type: "model.switched",
      previousProfile: "fast",
      currentProfile: "deep",
      provider: "openai_main",
      model: "gpt-test",
      switchedAt: "2026-05-10T00:00:00.000Z"
    });

    expect(parsed.type).toBe("model.switched");
  });

  it("rejects unknown fields on new renderer-facing contracts", () => {
    expect(() =>
      ProviderSummarySchema.parse({ ...providerSummary, secret: "raw" })
    ).toThrow();
    expect(() =>
      ProvidersResponseSchema.parse({ providers: [providerSummary], secret: "raw" })
    ).toThrow();
    expect(() =>
      ResolvedModelProfileSchema.parse({ ...resolvedProfile, secret: "raw" })
    ).toThrow();
    expect(() =>
      ModelSelectionResponseSchema.parse({
        selectedProfile: "fast",
        resolvedProfile,
        secret: "raw"
      })
    ).toThrow();
    expect(() =>
      SwitchModelProfileRequestSchema.parse({ profileId: "fast", secret: "raw" })
    ).toThrow();
    expect(() =>
      SwitchModelProfileResponseSchema.parse({
        previousProfile: null,
        selectedProfile: "fast",
        resolvedProfile,
        secret: "raw"
      })
    ).toThrow();
    expect(() =>
      TaskModelSnapshotRequestSchema.parse({ profileId: "fast", secret: "raw" })
    ).toThrow();
    expect(() =>
      TaskModelSnapshotResponseSchema.parse({
        profileId: "fast",
        resolvedProfile,
        snapshottedAt: "2026-05-10T00:00:00.000Z",
        secret: "raw"
      })
    ).toThrow();
  });
});
