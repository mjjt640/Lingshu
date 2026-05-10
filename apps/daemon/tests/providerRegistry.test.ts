import { afterEach, describe, expect, it, vi } from "vitest";

import { createProviderRegistry } from "../src/modules/providers/providerRegistry.js";
import type { LingshuConfig } from "../src/modules/config/configSchema.js";

function createConfig(): LingshuConfig {
  return {
    version: 1,
    app: { default_profile: null },
    trust: {
      allow_workspace_providers: false,
      allow_insecure_http_hosts: []
    },
    providers: {
      openai_main: {
        type: "openai",
        base_url: "https://api.openai.com/v1",
        auth: { source: "env", env: "OPENAI_API_KEY" },
        catalog: { source: "remote" }
      },
      openrouter_main: {
        type: "openrouter",
        base_url: "https://openrouter.ai/api/v1",
        auth: { source: "runtime_secret", id: "openrouter-key" },
        catalog: { source: "hybrid" }
      },
      compatible_main: {
        type: "openai-compatible",
        base_url: "https://llm.example.test/v1",
        auth: { source: "inline", value: "sk-secret" },
        catalog: { source: "static" }
      },
      ollama_local: {
        type: "ollama",
        base_url: "http://127.0.0.1:11434",
        auth: { source: "none" },
        catalog: { source: "remote" }
      }
    },
    profiles: {},
    agents: {}
  };
}

describe("ProviderRegistry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves OpenAI, OpenRouter, OpenAI-compatible, and Ollama configs to adapters", () => {
    const registry = createProviderRegistry(createConfig().providers);

    expect(registry.getAdapter("openai_main").kind).toBe("openai");
    expect(registry.getAdapter("openrouter_main").kind).toBe("openrouter");
    expect(registry.getAdapter("compatible_main").kind).toBe("openai-compatible");
    expect(registry.getAdapter("ollama_local").kind).toBe("ollama");
  });

  it("maps OpenAI-compatible providers to chat completion request previews", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("openai_main").createChatCompletionRequest({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.3,
      maxOutputTokens: 512,
      stream: true
    });

    expect(request).toEqual({
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      headers: {
        Authorization: "Bearer <redacted>",
        "Content-Type": "application/json"
      },
      body: {
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: "Hello" }],
        temperature: 0.3,
        max_tokens: 512,
        stream: true
      }
    });
  });

  it("maps Ollama providers to local chat request previews", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("ollama_local").createChatCompletionRequest({
      model: "llama3.2",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.1,
      maxOutputTokens: 256
    });

    expect(request).toEqual({
      method: "POST",
      url: "http://127.0.0.1:11434/api/chat",
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        model: "llama3.2",
        messages: [{ role: "user", content: "Hello" }],
        options: {
          temperature: 0.1,
          num_predict: 256
        },
        stream: false
      }
    });
  });

  it("throws clear errors for unsupported provider kind inputs", () => {
    const config = createConfig();
    config.providers.bad = {
      type: "anthropic",
      base_url: "https://api.anthropic.com",
      auth: { source: "env", env: "ANTHROPIC_API_KEY" },
      catalog: { source: "remote" }
    };

    const registry = createProviderRegistry(config.providers);

    expect(() => registry.getAdapter("bad")).toThrow(
      'Unsupported provider kind "anthropic" for provider "bad"'
    );
  });

  it("redacts auth values in provider summaries", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-real");
    const registry = createProviderRegistry(createConfig().providers);

    const summaries = registry.listProviderSummaries();

    expect(summaries).toEqual([
      {
        id: "openai_main",
        type: "openai",
        baseUrl: "https://api.openai.com/v1",
        auth: { source: "env", status: "configured" },
        catalog: { source: "remote" }
      },
      {
        id: "openrouter_main",
        type: "openrouter",
        baseUrl: "https://openrouter.ai/api/v1",
        auth: { source: "runtime_secret", status: "configured" },
        catalog: { source: "hybrid" }
      },
      {
        id: "compatible_main",
        type: "openai-compatible",
        baseUrl: "https://llm.example.test/v1",
        auth: { source: "inline", status: "configured" },
        catalog: { source: "static" }
      },
      {
        id: "ollama_local",
        type: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        auth: { source: "none", status: "not_required" },
        catalog: { source: "remote" }
      }
    ]);

    expect(JSON.stringify(summaries)).not.toContain("OPENAI_API_KEY");
    expect(JSON.stringify(summaries)).not.toContain("sk-real");
    expect(JSON.stringify(summaries)).not.toContain("sk-secret");
    expect(JSON.stringify(summaries)).not.toContain("openrouter-key");
  });
});
