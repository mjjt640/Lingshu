import type {
  ProviderAuthStatus,
  ProviderConfig,
  ProviderKind,
  ProviderSummary
} from "@lingshu/shared";
import type { ModelCapabilities } from "@lingshu/shared";
import { openAiCompatibleModelCapabilities } from "../models/modelCapabilities.js";
import type {
  ProviderAdapter,
  ProviderRequestPreview,
  UnifiedChatMessage,
  UnifiedChatCompletionInput
} from "./providerAdapter.js";
import {
  getProviderAuthStatus,
  joinSafeProviderPath,
  summarizeProviderConfig
} from "./providerAdapter.js";

function createHeaders(auth: ProviderAuthStatus): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (auth.status === "configured") {
    headers.Authorization = "Bearer <redacted>";
  }

  return headers;
}

function mapChatContent(content: UnifiedChatMessage["content"]): string | Record<string, unknown>[] {
  if (typeof content === "string") {
    return content;
  }

  return content.map((part) => {
    if (part.type === "text") {
      return {
        type: "text",
        text: part.text
      };
    }

    return {
      type: "image_url",
      image_url: {
        url: part.imageUrl,
        detail: part.detail ?? "auto"
      }
    };
  });
}

function mapResponsesContent(content: UnifiedChatMessage["content"]): Record<string, unknown>[] {
  const parts = typeof content === "string"
    ? [{ type: "text" as const, text: content }]
    : content;

  return parts.map((part) => {
    if (part.type === "text") {
      return {
        type: "input_text",
        text: part.text
      };
    }

    return {
      type: "input_image",
      image_url: part.imageUrl,
      detail: part.detail ?? "auto"
    };
  });
}

function mapChatMessages(messages: UnifiedChatMessage[]): Record<string, unknown>[] {
  return messages.map((message) => ({
    role: message.role,
    content: mapChatContent(message.content)
  }));
}

function mapResponsesInput(messages: UnifiedChatMessage[]): Record<string, unknown>[] {
  return messages.map((message) => ({
    role: message.role,
    content: mapResponsesContent(message.content)
  }));
}

export function createOpenAiCompatibleAdapter(
  kind: Extract<ProviderKind, "openai" | "openrouter" | "openai-compatible">,
  config: ProviderConfig
): ProviderAdapter {
  const adapter: ProviderAdapter = {
    kind,
    summarizeProvider(providerId: string, providerConfig: ProviderConfig): ProviderSummary {
      return summarizeProviderConfig(providerId, providerConfig);
    },
    getDefaultCapabilities(): ModelCapabilities {
      return openAiCompatibleModelCapabilities;
    },
    createDefaultRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview {
      return config.wire_api === "chat_completions"
        ? adapter.createChatCompletionRequest(input)
        : adapter.createResponsesRequest(input);
    },
    createChatCompletionRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview {
      const auth = getProviderAuthStatus(config.auth);
      const body: Record<string, unknown> = {
        model: input.model,
        messages: mapChatMessages(input.messages)
      };

      if (input.temperature !== undefined) {
        body.temperature = input.temperature;
      }

      if (input.maxOutputTokens !== undefined) {
        body.max_tokens = input.maxOutputTokens;
      }

      if (input.reasoningEffort !== undefined) {
        body.reasoning = { effort: input.reasoningEffort };
      }

      if (input.stream !== undefined) {
        body.stream = input.stream;
      }

      return {
        preview: true,
        method: "POST",
        url: joinSafeProviderPath(config.base_url, "/chat/completions"),
        auth,
        headers: createHeaders(auth),
        body
      };
    },
    createResponsesRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview {
      const auth = getProviderAuthStatus(config.auth);
      const body: Record<string, unknown> = {
        model: input.model,
        input: mapResponsesInput(input.messages)
      };

      if (input.temperature !== undefined) {
        body.temperature = input.temperature;
      }

      if (input.maxOutputTokens !== undefined) {
        body.max_output_tokens = input.maxOutputTokens;
      }

      if (input.reasoningEffort !== undefined) {
        body.reasoning = { effort: input.reasoningEffort };
      }

      if (input.stream !== undefined) {
        body.stream = input.stream;
      }

      return {
        preview: true,
        method: "POST",
        url: joinSafeProviderPath(config.base_url, "/responses"),
        auth,
        headers: createHeaders(auth),
        body
      };
    }
  };

  return adapter;
}
