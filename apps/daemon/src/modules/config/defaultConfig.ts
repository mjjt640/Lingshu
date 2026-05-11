import type { LingshuConfig } from "./configSchema.js";

export const defaultConfig: LingshuConfig = {
  version: 1,
  app: {
    default_profile: "local"
  },
  trust: {
    allow_workspace_providers: false,
    allow_insecure_http_hosts: ["127.0.0.1:11434", "localhost:11434"]
  },
  providers: {
    ollama_local: {
      type: "ollama",
      base_url: "http://127.0.0.1:11434",
      auth: { source: "none" },
      catalog: { source: "remote" }
    }
  },
  profiles: {
    local: {
      provider: "ollama_local",
      model: "llama3.2",
      label: "本地模型"
    }
  },
  agents: {
    default: {
      profile: "local"
    }
  }
};
