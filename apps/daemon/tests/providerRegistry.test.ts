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
      secret_ref_main: {
        type: "openai-compatible",
        base_url: "https://secret.example.test/v1",
        auth: { source: "secret_ref", ref: "shared-secret" },
        catalog: { source: "remote" }
      },
      compatible_main: {
        type: "openai-compatible",
        base_url: "https://llm.example.test/v1",
        auth: { source: "inline", value: "sk-secret" },
        catalog: { source: "static" }
      },
      relay_main: {
        type: "openai-compatible",
        base_url: "https://relay.example.com/proxy/openai/v1",
        auth: { source: "none" },
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

  function expectSafeUrlRejection(run: () => unknown, secrets: string[]): void {
    let thrown: unknown;

    try {
      run();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);

    const message = thrown instanceof Error ? thrown.message : String(thrown);
    expect(message).toContain("Provider baseUrl must not include credentials, query, or hash");

    for (const secret of secrets) {
      expect(message).not.toContain(secret);
    }
  }

  function expectInsecureHttpRejection(run: () => unknown, secrets: string[] = []): void {
    let thrown: unknown;

    try {
      run();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);

    const message = thrown instanceof Error ? thrown.message : String(thrown);
    expect(message).toContain("Provider baseUrl must use https unless it targets localhost");

    for (const secret of secrets) {
      expect(message).not.toContain(secret);
    }
  }

  it("resolves OpenAI, OpenRouter, OpenAI-compatible, and Ollama configs to adapters", () => {
    const registry = createProviderRegistry(createConfig().providers);

    expect(registry.getAdapter("openai_main").kind).toBe("openai");
    expect(registry.getAdapter("openrouter_main").kind).toBe("openrouter");
    expect(registry.getAdapter("compatible_main").kind).toBe("openai-compatible");
    expect(registry.getAdapter("ollama_local").kind).toBe("ollama");
  });

  it("maps OpenAI-compatible providers to chat completion request previews", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-real");
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("openai_main").createChatCompletionRequest({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.3,
      maxOutputTokens: 512,
      stream: true
    });

    expect(request).toEqual({
      preview: true,
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      auth: { source: "env", status: "configured" },
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
    expect(JSON.stringify(request)).not.toContain("sk-real");
  });

  it("uses provider wire_api to choose default OpenAI-compatible request previews", () => {
    const config = createConfig();
    config.providers.responses_default = {
      type: "openai-compatible",
      base_url: "https://responses.example.test/v1",
      wire_api: "responses",
      auth: { source: "none" },
      catalog: { source: "static" }
    };
    config.providers.chat_default = {
      type: "openai-compatible",
      base_url: "https://chat.example.test/v1",
      wire_api: "chat_completions",
      auth: { source: "none" },
      catalog: { source: "static" }
    };
    const registry = createProviderRegistry(config.providers);

    const responsesRequest = registry.getAdapter("responses_default").createDefaultRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello responses" }]
    });
    const chatRequest = registry.getAdapter("chat_default").createDefaultRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello chat" }]
    });

    expect(responsesRequest.url).toBe("https://responses.example.test/v1/responses");
    expect(responsesRequest.body).toMatchObject({
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: "Hello responses" }]
        }
      ]
    });
    expect(chatRequest.url).toBe("https://chat.example.test/v1/chat/completions");
    expect(chatRequest.body).toMatchObject({
      messages: [{ role: "user", content: "Hello chat" }]
    });
  });

  it("defaults OpenAI-compatible request previews to responses and Ollama to chat", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const openAiCompatibleRequest = registry.getAdapter("relay_main").createDefaultRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello default" }]
    });
    const ollamaRequest = registry.getAdapter("ollama_local").createDefaultRequest({
      model: "llama3.2",
      messages: [{ role: "user", content: "Hello local" }]
    });

    expect(openAiCompatibleRequest.url).toBe("https://relay.example.com/proxy/openai/v1/responses");
    expect(ollamaRequest.url).toBe("http://127.0.0.1:11434/api/chat");
  });

  it("maps third-party relay OpenAI-compatible chat requests with opaque model IDs", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("relay_main").createChatCompletionRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello relay" }]
    });

    expect(request).toEqual({
      preview: true,
      method: "POST",
      url: "https://relay.example.com/proxy/openai/v1/chat/completions",
      auth: { source: "none", status: "not_required" },
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        model: "vendor/model:beta",
        messages: [{ role: "user", content: "Hello relay" }]
      }
    });
  });

  it("maps chat completion image parts to image_url content parts", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("relay_main").createChatCompletionRequest({
      model: "vendor/model:beta",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image" },
            { type: "image_url", imageUrl: "https://cdn.example.test/cat.png" }
          ]
        }
      ]
    });

    expect(request.body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this image" },
          {
            type: "image_url",
            image_url: {
              url: "https://cdn.example.test/cat.png",
              detail: "auto"
            }
          }
        ]
      }
    ]);
  });

  it("maps third-party relay OpenAI-compatible responses requests with opaque model IDs", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("relay_main").createResponsesRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello responses" }],
      temperature: 0.4,
      maxOutputTokens: 2048,
      stream: true
    });

    expect(request).toEqual({
      preview: true,
      method: "POST",
      url: "https://relay.example.com/proxy/openai/v1/responses",
      auth: { source: "none", status: "not_required" },
      headers: {
        "Content-Type": "application/json"
      },
      body: {
        model: "vendor/model:beta",
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: "Hello responses" }]
          }
        ],
        temperature: 0.4,
        max_output_tokens: 2048,
        stream: true
      }
    });
  });

  it("includes reasoning effort in OpenAI-compatible request preview bodies", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const responsesRequest = registry.getAdapter("relay_main").createResponsesRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello reasoning" }],
      reasoningEffort: "xhigh"
    });
    const chatRequest = registry.getAdapter("relay_main").createChatCompletionRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello reasoning" }],
      reasoningEffort: "high"
    });

    expect(responsesRequest.body.reasoning).toEqual({ effort: "xhigh" });
    expect(chatRequest.body.reasoning).toEqual({ effort: "high" });
  });

  it("maps responses text and image input parts to input_text and input_image", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("relay_main").createResponsesRequest({
      model: "vendor/model:beta",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this" },
            {
              type: "image_url",
              imageUrl: "https://cdn.example.test/page.png",
              detail: "high"
            }
          ]
        }
      ]
    });

    expect(request.body.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Read this" },
          {
            type: "input_image",
            image_url: "https://cdn.example.test/page.png",
            detail: "high"
          }
        ]
      }
    ]);
  });

  it("omits Authorization placeholders for OpenAI-compatible responses requests that do not require auth", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("relay_main").createResponsesRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(request.headers).toEqual({
      "Content-Type": "application/json"
    });
  });

  it("keeps OpenRouter path base URLs usable in request previews", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("openrouter_main").createChatCompletionRequest({
      model: "openai/gpt-4.1-mini",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("rejects remote plaintext HTTP provider summaries", () => {
    const config = createConfig();
    config.providers.remote_http = {
      type: "openai-compatible",
      base_url: "http://relay.example.com/v1",
      auth: { source: "none" },
      catalog: { source: "static" }
    };
    const registry = createProviderRegistry(config.providers);

    expectInsecureHttpRejection(() => registry.listProviderSummaries());
  });

  it("rejects remote plaintext HTTP chat and responses request previews", () => {
    const config = createConfig();
    config.providers.remote_http = {
      type: "openai-compatible",
      base_url: "http://relay.example.com/v1?api_key=query-secret#hash-secret",
      auth: { source: "none" },
      catalog: { source: "static" }
    };
    const registry = createProviderRegistry(config.providers);

    expectInsecureHttpRejection(
      () =>
        registry.getAdapter("remote_http").createChatCompletionRequest({
          model: "vendor/model:beta",
          messages: [{ role: "user", content: "Hello" }]
        }),
      ["query-secret", "hash-secret"]
    );
    expectInsecureHttpRejection(
      () =>
        registry.getAdapter("remote_http").createResponsesRequest({
          model: "vendor/model:beta",
          messages: [{ role: "user", content: "Hello" }]
        }),
      ["query-secret", "hash-secret"]
    );
  });

  it("includes safe missing auth status without Authorization for env providers", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("openai_main").createChatCompletionRequest({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(request.preview).toBe(true);
    expect(request.auth).toEqual({ source: "env", status: "missing" });
    expect(request.headers).toEqual({
      "Content-Type": "application/json"
    });
    expect(JSON.stringify(request)).not.toContain("OPENAI_API_KEY");
  });

  it("includes safe missing auth status without Authorization for secret-backed providers", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const runtimeSecretRequest = registry
      .getAdapter("openrouter_main")
      .createChatCompletionRequest({
        model: "openai/gpt-4.1-mini",
        messages: [{ role: "user", content: "Hello" }]
      });
    const secretRefRequest = registry
      .getAdapter("secret_ref_main")
      .createResponsesRequest({
        model: "vendor/model:beta",
        messages: [{ role: "user", content: "Hello" }]
      });

    expect(runtimeSecretRequest.preview).toBe(true);
    expect(runtimeSecretRequest.auth).toEqual({
      source: "runtime_secret",
      status: "missing"
    });
    expect(runtimeSecretRequest.headers).toEqual({
      "Content-Type": "application/json"
    });
    expect(secretRefRequest.preview).toBe(true);
    expect(secretRefRequest.auth).toEqual({
      source: "secret_ref",
      status: "missing"
    });
    expect(secretRefRequest.headers).toEqual({
      "Content-Type": "application/json"
    });

    expect(JSON.stringify(runtimeSecretRequest)).not.toContain("openrouter-key");
    expect(JSON.stringify(secretRefRequest)).not.toContain("shared-secret");
  });

  it("includes safe configured auth status with a placeholder for inline providers", () => {
    const registry = createProviderRegistry(createConfig().providers);

    const request = registry.getAdapter("compatible_main").createResponsesRequest({
      model: "vendor/model:beta",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(request.preview).toBe(true);
    expect(request.auth).toEqual({ source: "inline", status: "configured" });
    expect(request.headers).toEqual({
      Authorization: "Bearer <redacted>",
      "Content-Type": "application/json"
    });
    expect(JSON.stringify(request)).not.toContain("sk-secret");
  });

  it("omits Authorization placeholders for OpenAI-compatible providers that do not require auth", () => {
    const config = createConfig();
    config.providers.no_auth = {
      type: "openai-compatible",
      base_url: "https://no-auth.example.test/v1",
      auth: { source: "none" },
      catalog: { source: "static" }
    };
    const registry = createProviderRegistry(config.providers);

    const request = registry.getAdapter("no_auth").createChatCompletionRequest({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(request.headers).toEqual({
      "Content-Type": "application/json"
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
      preview: true,
      method: "POST",
      url: "http://127.0.0.1:11434/api/chat",
      auth: { source: "none", status: "not_required" },
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

  it("rejects unsafe OpenAI-compatible request preview base URLs without leaking secrets", () => {
    const config = createConfig();
    config.providers.unsafe = {
      type: "openai-compatible",
      base_url: "https://token-secret@example.com/v1?api_key=query-secret#hash-secret",
      auth: { source: "none" },
      catalog: { source: "static" }
    };
    const registry = createProviderRegistry(config.providers);

    expectSafeUrlRejection(
      () =>
        registry.getAdapter("unsafe").createChatCompletionRequest({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }]
        }),
      ["token-secret", "query-secret", "hash-secret"]
    );
  });

  it("rejects unsafe OpenAI-compatible responses request preview base URLs without leaking secrets", () => {
    const config = createConfig();
    config.providers.unsafe = {
      type: "openai-compatible",
      base_url: "https://token-secret@example.com/v1?api_key=query-secret#hash-secret",
      auth: { source: "none" },
      catalog: { source: "static" }
    };
    const registry = createProviderRegistry(config.providers);

    expectSafeUrlRejection(
      () =>
        registry.getAdapter("unsafe").createResponsesRequest({
          model: "test-model",
          messages: [{ role: "user", content: "Hello" }]
        }),
      ["token-secret", "query-secret", "hash-secret"]
    );
  });

  it("rejects unsafe Ollama request preview base URLs without leaking secrets", () => {
    const config = createConfig();
    config.providers.unsafe_ollama = {
      type: "ollama",
      base_url: "http://token-secret@127.0.0.1:11434?api_key=query-secret#hash-secret",
      auth: { source: "none" },
      catalog: { source: "remote" }
    };
    const registry = createProviderRegistry(config.providers);

    expectSafeUrlRejection(
      () =>
        registry.getAdapter("unsafe_ollama").createChatCompletionRequest({
          model: "llama3.2",
          messages: [{ role: "user", content: "Hello" }]
        }),
      ["token-secret", "query-secret", "hash-secret"]
    );
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
        auth: { source: "runtime_secret", status: "missing" },
        catalog: { source: "hybrid" }
      },
      {
        id: "secret_ref_main",
        type: "openai-compatible",
        baseUrl: "https://secret.example.test/v1",
        auth: { source: "secret_ref", status: "missing" },
        catalog: { source: "remote" }
      },
      {
        id: "compatible_main",
        type: "openai-compatible",
        baseUrl: "https://llm.example.test/v1",
        auth: { source: "inline", status: "configured" },
        catalog: { source: "static" }
      },
      {
        id: "relay_main",
        type: "openai-compatible",
        baseUrl: "https://relay.example.com/proxy/openai/v1",
        auth: { source: "none", status: "not_required" },
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
    expect(JSON.stringify(summaries)).not.toContain("shared-secret");
  });
});
