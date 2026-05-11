import { describe, expect, it } from "vitest";
import { LingshuConfigSchema } from "../src/modules/config/configSchema.js";

describe("LingshuConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const parsed = LingshuConfigSchema.parse({
      version: 1,
      app: { default_profile: "fast" },
      providers: {
        local: {
          type: "ollama",
          base_url: "http://127.0.0.1:11434",
          auth: { source: "none" },
          catalog: { source: "remote" }
        }
      },
      profiles: {
        fast: {
          provider: "local",
          model: "llama3.2",
          label: "本地快速模型"
        }
      },
      agents: {
        default: { profile: "fast" }
      }
    });

    expect(parsed.app.default_profile).toBe("fast");
    expect(parsed.providers.local.type).toBe("ollama");
    expect(parsed.profiles.fast.provider).toBe("local");
  });

  it("rejects an invalid provider kind", () => {
    expect(() =>
      LingshuConfigSchema.parse({
        version: 1,
        providers: {
          bad: {
            type: "unknown",
            base_url: "https://example.com",
            auth: { source: "none" }
          }
        }
      })
    ).toThrow();
  });
});
