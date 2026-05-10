import type {
  AuthSource,
  ModelProfileConfig,
  ProviderConfig
} from "@lingshu/shared";
import {
  AuthSourceSchema,
  ReasoningEffortSchema,
  WireApiSchema,
  type ReasoningEffort
} from "@lingshu/shared";

import type { LingshuConfig } from "./configSchema.js";

type RawRecord = Record<string, unknown>;

interface CodexModelProviderConfig {
  name?: string;
  base_url?: string;
  wire_api?: unknown;
  requires_openai_auth?: boolean;
  auth?: unknown;
}

type RawLingshuConfig = Partial<Omit<LingshuConfig, "model_providers">> & {
  model_provider?: unknown;
  model?: unknown;
  review_model?: unknown;
  model_reasoning_effort?: unknown;
  model_providers?: Record<string, CodexModelProviderConfig>;
};

export type CodexCompatConfigInput = RawLingshuConfig & RawRecord;

export function normalizeCodexCompatConfig(
  input: CodexCompatConfigInput
): Partial<LingshuConfig> {
  const { model_providers: _modelProviders, ...nativeInput } = input;
  const normalized: Partial<LingshuConfig> = {
    ...(nativeInput as Partial<LingshuConfig>),
    app: input.app ? { ...input.app } : undefined,
    providers: { ...(input.providers ?? {}) },
    profiles: { ...(input.profiles ?? {}) },
    agents: input.agents ? { ...input.agents } : undefined
  };

  normalizeCodexModelProviders(input, normalized);
  normalizeCodexProfiles(input, normalized);

  return normalized;
}

function normalizeCodexModelProviders(
  input: CodexCompatConfigInput,
  normalized: Partial<LingshuConfig>
): void {
  const providers = normalized.providers ?? {};
  const codexProviders = input.model_providers ?? {};

  for (const [providerId, codexProvider] of Object.entries(codexProviders)) {
    if (providers[providerId] || !codexProvider.base_url) {
      continue;
    }

    providers[providerId] = {
      type: "openai-compatible",
      base_url: codexProvider.base_url,
      wire_api: parseWireApi(codexProvider.wire_api),
      auth: resolveCodexProviderAuth(codexProvider),
      catalog: { source: "hybrid" }
    };
  }

  normalized.providers = providers;
}

function normalizeCodexProfiles(
  input: CodexCompatConfigInput,
  normalized: Partial<LingshuConfig>
): void {
  if (typeof input.model_provider !== "string") {
    return;
  }

  const profiles = normalized.profiles ?? {};
  const reasoningEffort = parseReasoningEffort(input.model_reasoning_effort);

  if (typeof input.model === "string" && !profiles.primary) {
    profiles.primary = createCodexProfile({
      provider: input.model_provider,
      model: input.model,
      label: "Primary",
      reasoningEffort
    });
  }

  if (typeof input.review_model === "string" && !profiles.review) {
    profiles.review = createCodexProfile({
      provider: input.model_provider,
      model: input.review_model,
      label: "Review",
      reasoningEffort
    });
  }

  normalized.profiles = profiles;

  if (input.model && (!normalized.app || !normalized.app.default_profile)) {
    normalized.app = {
      ...(normalized.app ?? {}),
      default_profile: "primary"
    };
  }
}

function createCodexProfile(input: {
  provider: string;
  model: string;
  label: string;
  reasoningEffort?: ReasoningEffort;
}): ModelProfileConfig {
  const profile: ModelProfileConfig = {
    provider: input.provider,
    model: input.model,
    label: input.label
  };

  if (input.reasoningEffort) {
    profile.reasoning_effort = input.reasoningEffort;
  }

  return profile;
}

function resolveCodexProviderAuth(
  codexProvider: CodexModelProviderConfig
): AuthSource {
  const parsedNativeAuth = AuthSourceSchema.safeParse(codexProvider.auth);

  if (parsedNativeAuth.success) {
    return parsedNativeAuth.data;
  }

  if (codexProvider.requires_openai_auth === true) {
    return { source: "env", env: "OPENAI_API_KEY" };
  }

  return { source: "none" };
}

function parseWireApi(value: unknown): ProviderConfig["wire_api"] {
  const parsed = WireApiSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseReasoningEffort(value: unknown): ReasoningEffort | undefined {
  const parsed = ReasoningEffortSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
