import { readFile } from "node:fs/promises";
import * as TOML from "@iarna/toml";
import { getConfigPaths } from "./configPaths.js";
import { normalizeCodexCompatConfig, type CodexCompatConfigInput } from "./codexCompat.js";
import { defaultConfig } from "./defaultConfig.js";
import { LingshuConfigSchema, type LingshuConfig } from "./configSchema.js";

export interface LoadConfigOptions {
  homeDir?: string;
  workspaceDir: string;
}

export interface LoadConfigResult {
  config: LingshuConfig;
  sources: string[];
}

export async function loadConfig(options: LoadConfigOptions): Promise<LoadConfigResult> {
  const paths = getConfigPaths(options.workspaceDir, options.homeDir);
  const orderedFiles = [paths.codexConfig, paths.userConfig, paths.workspaceShared, paths.workspaceLocal];
  const sources = ["built-in defaults"];
  let config = defaultConfig;

  for (const filePath of orderedFiles) {
    const loaded = await readTomlFile(filePath);
    if (!loaded) {
      continue;
    }

    config = mergeConfig(config, normalizeCodexCompatConfig(loaded));
    sources.push(filePath);
  }

  return {
    config: LingshuConfigSchema.parse(config),
    sources
  };
}

async function readTomlFile(filePath: string): Promise<CodexCompatConfigInput | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    return TOML.parse(raw) as CodexCompatConfigInput;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function mergeConfig(base: LingshuConfig, override: Partial<LingshuConfig>): LingshuConfig {
  return LingshuConfigSchema.parse({
    ...base,
    ...override,
    app: {
      ...base.app,
      ...override.app
    },
    trust: {
      ...base.trust,
      ...override.trust
    },
    providers: {
      ...base.providers,
      ...override.providers
    },
    profiles: {
      ...base.profiles,
      ...override.profiles
    },
    agents: {
      ...base.agents,
      ...override.agents
    }
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
