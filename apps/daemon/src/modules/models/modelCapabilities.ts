import type { ModelCapabilities, ProviderKind } from "@lingshu/shared";

export const openAiCompatibleModelCapabilities: ModelCapabilities = {
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: true,
  supportsJson: true,
  supportsReasoning: true,
  supportsSystemPrompt: true,
  supportsLocalExecution: false
};

export const ollamaModelCapabilities: ModelCapabilities = {
  supportsStreaming: true,
  supportsTools: false,
  supportsVision: false,
  supportsJson: true,
  supportsReasoning: false,
  supportsSystemPrompt: true,
  supportsLocalExecution: true
};

export function getDefaultModelCapabilities(kind: ProviderKind): ModelCapabilities {
  if (
    kind === "openai" ||
    kind === "openrouter" ||
    kind === "openai-compatible"
  ) {
    return openAiCompatibleModelCapabilities;
  }

  if (kind === "ollama") {
    return ollamaModelCapabilities;
  }

  throw new Error(`Unsupported provider kind "${kind}"`);
}
