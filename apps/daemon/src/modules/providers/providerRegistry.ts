import type {
  ProviderConfig,
  ProviderSummary
} from "@lingshu/shared";
import type { ProviderAdapter } from "./providerAdapter.js";
import { createOllamaAdapter } from "./ollamaAdapter.js";
import { createOpenAiCompatibleAdapter } from "./openAiCompatibleAdapter.js";

export interface ProviderRegistry {
  getAdapter(providerId: string): ProviderAdapter;
  getProviderConfig(providerId: string): ProviderConfig;
  listProviderSummaries(): ProviderSummary[];
}

function createAdapter(providerId: string, config: ProviderConfig): ProviderAdapter {
  if (
    config.type === "openai" ||
    config.type === "openrouter" ||
    config.type === "openai-compatible"
  ) {
    return createOpenAiCompatibleAdapter(config.type, config);
  }

  if (config.type === "ollama") {
    return createOllamaAdapter(config);
  }

  throw new Error(`Unsupported provider kind "${config.type}" for provider "${providerId}"`);
}

export function createProviderRegistry(
  providers: Record<string, ProviderConfig>
): ProviderRegistry {
  return {
    getAdapter(providerId: string): ProviderAdapter {
      const config = providers[providerId];

      if (!config) {
        throw new Error(`Provider "${providerId}" was not found`);
      }

      return createAdapter(providerId, config);
    },
    getProviderConfig(providerId: string): ProviderConfig {
      const config = providers[providerId];

      if (!config) {
        throw new Error(`Provider "${providerId}" was not found`);
      }

      return config;
    },
    listProviderSummaries(): ProviderSummary[] {
      return Object.entries(providers).map(([providerId, config]) => {
        const adapter = createAdapter(providerId, config);
        return adapter.summarizeProvider(providerId, config);
      });
    }
  };
}
