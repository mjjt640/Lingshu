import type {
  ModelCapabilities,
  ProviderSummary
} from "@lingshu/shared";
import {
  ProviderSummarySchema,
  type AuthSource,
  type ProviderConfig,
  type ProviderKind
} from "@lingshu/shared";

export type UnifiedChatMessageRole = "system" | "user" | "assistant" | "tool";

export interface UnifiedChatMessage {
  role: UnifiedChatMessageRole;
  content: string;
}

export interface UnifiedChatCompletionInput {
  model: string;
  messages: UnifiedChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  stream?: boolean;
}

export interface ProviderRequestPreview {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ProviderAdapter {
  kind: ProviderKind;
  summarizeProvider(providerId: string, config: ProviderConfig): ProviderSummary;
  getDefaultCapabilities(): ModelCapabilities;
  createChatCompletionRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview;
}

export function getProviderAuthStatus(auth: AuthSource): ProviderSummary["auth"] {
  if (auth.source === "none") {
    return {
      source: auth.source,
      status: "not_required"
    };
  }

  if (auth.source === "env") {
    return {
      source: auth.source,
      status: process.env[auth.env] ? "configured" : "missing"
    };
  }

  return {
    source: auth.source,
    status: "configured"
  };
}

export function summarizeProviderConfig(
  providerId: string,
  config: ProviderConfig
): ProviderSummary {
  return ProviderSummarySchema.parse({
    id: providerId,
    type: config.type,
    baseUrl: config.base_url,
    auth: getProviderAuthStatus(config.auth),
    catalog: config.catalog
  });
}

export function joinProviderPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
