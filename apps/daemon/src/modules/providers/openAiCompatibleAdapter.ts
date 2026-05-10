import type {
  ProviderConfig,
  ProviderKind,
  ProviderSummary
} from "@lingshu/shared";
import type { ModelCapabilities } from "@lingshu/shared";
import { openAiCompatibleModelCapabilities } from "../models/modelCapabilities.js";
import type {
  ProviderAdapter,
  ProviderRequestPreview,
  UnifiedChatCompletionInput
} from "./providerAdapter.js";
import { joinSafeProviderPath, summarizeProviderConfig } from "./providerAdapter.js";

export function createOpenAiCompatibleAdapter(
  kind: Extract<ProviderKind, "openai" | "openrouter" | "openai-compatible">,
  config: ProviderConfig
): ProviderAdapter {
  return {
    kind,
    summarizeProvider(providerId: string, providerConfig: ProviderConfig): ProviderSummary {
      return summarizeProviderConfig(providerId, providerConfig);
    },
    getDefaultCapabilities(): ModelCapabilities {
      return openAiCompatibleModelCapabilities;
    },
    createChatCompletionRequest(input: UnifiedChatCompletionInput): ProviderRequestPreview {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      if (config.auth.source !== "none") {
        headers.Authorization = "Bearer <redacted>";
      }

      const body: Record<string, unknown> = {
        model: input.model,
        messages: input.messages
      };

      if (input.temperature !== undefined) {
        body.temperature = input.temperature;
      }

      if (input.maxOutputTokens !== undefined) {
        body.max_tokens = input.maxOutputTokens;
      }

      if (input.stream !== undefined) {
        body.stream = input.stream;
      }

      return {
        method: "POST",
        url: joinSafeProviderPath(config.base_url, "/chat/completions"),
        headers,
        body
      };
    }
  };
}
