import type {
  ModelCapabilities,
  ProviderAuthStatus,
  ProviderSummary
} from "@lingshu/shared";
import {
  ProviderBaseUrlSchema,
  ProviderSummarySchema,
  type AuthSource,
  type ProviderConfig,
  type ProviderKind
} from "@lingshu/shared";

export type UnifiedChatMessageRole = "system" | "user" | "assistant" | "tool";

export type UnifiedContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; imageUrl: string; detail?: "low" | "high" | "auto" };

export interface UnifiedChatMessage {
  role: UnifiedChatMessageRole;
  content: string | UnifiedContentPart[];
}

export interface UnifiedChatCompletionInput {
  model: string;
  messages: UnifiedChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  stream?: boolean;
}

export interface ProviderRequestPreview {
  preview: true;
  method: "POST";
  url: string;
  auth: ProviderAuthStatus;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ProviderAdapter {
  kind: ProviderKind;
  summarizeProvider(providerId: string, config: ProviderConfig): ProviderSummary;
  getDefaultCapabilities(): ModelCapabilities;
  createChatCompletionRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview;
  createResponsesRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview;
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

  if (auth.source === "secret_ref" || auth.source === "runtime_secret") {
    return {
      source: auth.source,
      status: "missing"
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
  const baseUrl = parseSafeProviderBaseUrl(config.base_url);

  return ProviderSummarySchema.parse({
    id: providerId,
    type: config.type,
    baseUrl,
    auth: getProviderAuthStatus(config.auth),
    catalog: config.catalog
  });
}

export function joinProviderPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function isLocalHttpHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export function parseSafeProviderBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);

    if (url.protocol === "http:" && !isLocalHttpHost(url.hostname)) {
      throw new Error("Provider baseUrl must use https unless it targets localhost");
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Provider baseUrl")) {
      throw error;
    }
  }

  const parsedBaseUrl = ProviderBaseUrlSchema.safeParse(baseUrl);

  if (!parsedBaseUrl.success) {
    throw new Error("Provider baseUrl must not include credentials, query, or hash");
  }

  return parsedBaseUrl.data;
}

export function joinSafeProviderPath(baseUrl: string, path: string): string {
  return joinProviderPath(parseSafeProviderBaseUrl(baseUrl), path);
}
