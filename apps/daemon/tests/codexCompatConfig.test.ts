import { describe, expect, it } from "vitest";

import { normalizeCodexCompatConfig } from "../src/modules/config/codexCompat.js";

describe("normalizeCodexCompatConfig", () => {
  it("normalizes screenshot-style Codex model config into native Lingshu providers and profiles", () => {
    const normalized = normalizeCodexCompatConfig({
      model_provider: "OpenAI",
      model: "gpt-5.4",
      review_model: "gpt-5.4",
      model_reasoning_effort: "xhigh",
      disable_response_storage: true,
      network_access: "enabled",
      model_context_window: 1000000,
      model_auto_compact_token_limit: 900000,
      model_providers: {
        OpenAI: {
          name: "OpenAI",
          base_url: "https://subapi.muxueai.pro",
          wire_api: "responses",
          requires_openai_auth: true
        },
        Relay: {
          name: "Relay",
          base_url: "https://relay.example.test/openai/v1",
          wire_api: "chat_completions",
          requires_openai_auth: false
        }
      }
    });

    expect(normalized.providers.OpenAI).toEqual({
      type: "openai-compatible",
      base_url: "https://subapi.muxueai.pro",
      wire_api: "responses",
      auth: { source: "env", env: "OPENAI_API_KEY" },
      catalog: { source: "hybrid" }
    });
    expect(normalized.providers.Relay).toEqual({
      type: "openai-compatible",
      base_url: "https://relay.example.test/openai/v1",
      wire_api: "chat_completions",
      auth: { source: "none" },
      catalog: { source: "hybrid" }
    });
    expect(normalized.profiles.primary).toEqual({
      provider: "OpenAI",
      model: "gpt-5.4",
      label: "Primary",
      reasoning_effort: "xhigh"
    });
    expect(normalized.profiles.review).toEqual({
      provider: "OpenAI",
      model: "gpt-5.4",
      label: "Review",
      reasoning_effort: "xhigh"
    });
    expect(normalized.app.default_profile).toBe("primary");
  });

  it("preserves native providers and profiles when Codex compatibility fields overlap", () => {
    const normalized = normalizeCodexCompatConfig({
      model_provider: "OpenAI",
      model: "gpt-5.4",
      review_model: "gpt-5.4",
      model_reasoning_effort: "xhigh",
      providers: {
        OpenAI: {
          type: "openai",
          base_url: "https://api.openai.com/v1",
          auth: { source: "runtime_secret", id: "native-openai-key" },
          catalog: { source: "remote" },
          wire_api: "chat_completions"
        },
        relay: {
          type: "openai-compatible",
          base_url: "https://relay.example.test/v1",
          auth: { source: "none" },
          catalog: { source: "static" }
        }
      },
      profiles: {
        primary: {
          provider: "relay",
          model: "native-primary",
          label: "Native Primary",
          reasoning_effort: "low"
        },
        custom_review: {
          provider: "relay",
          model: "native-review"
        }
      },
      app: {
        default_profile: "custom_review"
      },
      model_providers: {
        OpenAI: {
          name: "OpenAI",
          base_url: "https://subapi.muxueai.pro",
          wire_api: "responses",
          requires_openai_auth: true
        }
      }
    });

    expect(normalized.providers.OpenAI).toEqual({
      type: "openai",
      base_url: "https://api.openai.com/v1",
      auth: { source: "runtime_secret", id: "native-openai-key" },
      catalog: { source: "remote" },
      wire_api: "chat_completions"
    });
    expect(normalized.providers.relay).toEqual({
      type: "openai-compatible",
      base_url: "https://relay.example.test/v1",
      auth: { source: "none" },
      catalog: { source: "static" }
    });
    expect(normalized.profiles.primary).toEqual({
      provider: "relay",
      model: "native-primary",
      label: "Native Primary",
      reasoning_effort: "low"
    });
    expect(normalized.profiles.review).toEqual({
      provider: "OpenAI",
      model: "gpt-5.4",
      label: "Review",
      reasoning_effort: "xhigh"
    });
    expect(normalized.profiles.custom_review).toEqual({
      provider: "relay",
      model: "native-review"
    });
    expect(normalized.app.default_profile).toBe("custom_review");
  });
});
