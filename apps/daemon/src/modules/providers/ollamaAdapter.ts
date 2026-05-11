import type {
  ProviderConfig,
  ProviderSummary
} from "@lingshu/shared";
import type { ModelCapabilities } from "@lingshu/shared";
import { ollamaModelCapabilities } from "../models/modelCapabilities.js";
import type {
  ProviderAdapter,
  ProviderRequestPreview,
  UnifiedChatCompletionInput
} from "./providerAdapter.js";
import {
  getProviderAuthStatus,
  joinSafeProviderPath,
  summarizeProviderConfig
} from "./providerAdapter.js";

export function createOllamaAdapter(config: ProviderConfig): ProviderAdapter {
  const adapter: ProviderAdapter = {
    kind: "ollama",
    summarizeProvider(providerId: string, providerConfig: ProviderConfig): ProviderSummary {
      return summarizeProviderConfig(providerId, providerConfig);
    },
    getDefaultCapabilities(): ModelCapabilities {
      return ollamaModelCapabilities;
    },
    createDefaultRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview {
      return adapter.createChatCompletionRequest(input);
    },
    createChatCompletionRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview {
      const auth = getProviderAuthStatus(config.auth);
      const options: Record<string, unknown> = {};

      if (input.temperature !== undefined) {
        options.temperature = input.temperature;
      }

      if (input.maxOutputTokens !== undefined) {
        options.num_predict = input.maxOutputTokens;
      }

      const body: Record<string, unknown> = {
        model: input.model,
        messages: input.messages,
        stream: input.stream ?? false
      };

      if (Object.keys(options).length > 0) {
        body.options = options;
      }

      return {
        preview: true,
        method: "POST",
        url: joinSafeProviderPath(config.base_url, "/api/chat"),
        auth,
        headers: {
          "Content-Type": "application/json"
        },
        body
      };
    },
    createResponsesRequest(): ProviderRequestPreview {
      throw new Error('Provider "ollama" does not support Responses request previews');
    }
  };

  return adapter;
}
