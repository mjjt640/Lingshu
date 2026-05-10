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
import { joinProviderPath, summarizeProviderConfig } from "./providerAdapter.js";

export function createOllamaAdapter(config: ProviderConfig): ProviderAdapter {
  return {
    kind: "ollama",
    summarizeProvider(providerId: string, providerConfig: ProviderConfig): ProviderSummary {
      return summarizeProviderConfig(providerId, providerConfig);
    },
    getDefaultCapabilities(): ModelCapabilities {
      return ollamaModelCapabilities;
    },
    createChatCompletionRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview {
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
        method: "POST",
        url: joinProviderPath(config.base_url, "/api/chat"),
        headers: {
          "Content-Type": "application/json"
        },
        body
      };
    }
  };
}
