import type { LingshuConfig } from "../config/configSchema.js";

export interface ModelSwitchResult {
  previousProfile: string | null;
  selectedProfile: string;
}

export interface ModelSelectionStore {
  getSelectedProfile(): string | null;
  switchProfile(profileId: string): ModelSwitchResult;
}

function getInitialSelectedProfile(config: LingshuConfig): string | null {
  if (config.app.default_profile && config.profiles[config.app.default_profile]) {
    return config.app.default_profile;
  }

  return Object.keys(config.profiles)[0] ?? null;
}

export function createModelSelectionStore(config: LingshuConfig): ModelSelectionStore {
  let selectedProfile = getInitialSelectedProfile(config);

  return {
    getSelectedProfile(): string | null {
      return selectedProfile;
    },
    switchProfile(profileId: string): ModelSwitchResult {
      if (!config.profiles[profileId]) {
        throw new Error(`Model profile "${profileId}" was not found`);
      }

      const previousProfile = selectedProfile;
      selectedProfile = profileId;

      return {
        previousProfile,
        selectedProfile
      };
    }
  };
}
