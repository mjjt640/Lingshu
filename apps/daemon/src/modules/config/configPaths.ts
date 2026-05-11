import os from "node:os";
import path from "node:path";

export interface ConfigPathSet {
  userConfig: string;
  userSecrets: string;
  codexConfig: string;
  workspaceShared: string;
  workspaceLocal: string;
}

export function getConfigPaths(workspaceDir: string, homeDir = os.homedir()): ConfigPathSet {
  return {
    userConfig: path.join(homeDir, ".lingshu", "config.toml"),
    userSecrets: path.join(homeDir, ".lingshu", "secrets.toml"),
    codexConfig: path.join(homeDir, ".codex", "config.toml"),
    workspaceShared: path.join(workspaceDir, ".lingshu.toml"),
    workspaceLocal: path.join(workspaceDir, ".lingshu.local.toml")
  };
}
