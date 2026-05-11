import type { LingshuConfig } from "../config/configSchema.js";

export interface ModelSwitchResult {
  previousProfile: string | null;
  selectedProfile: string;
}

export interface ModelSelectionStore {
  getSelectedProfile(): string | null;
  switchProfile(profileId: string): ModelSwitchResult;
}

function getInitialSelectedProfile(
  config: LingshuConfig,
  validProfiles: Set<string>
): string | null {
  if (config.app.default_profile && validProfiles.has(config.app.default_profile)) {
    return config.app.default_profile;
  }

  return validProfiles.values().next().value ?? null;
}

export function createModelSelectionStore(config: LingshuConfig): ModelSelectionStore {
  const validProfiles = new Set(Object.keys(config.profiles));
  let selectedProfile = getInitialSelectedProfile(config, validProfiles);

  return {
    getSelectedProfile(): string | null {
      return selectedProfile;
    },
    switchProfile(profileId: string): ModelSwitchResult {
      if (!validProfiles.has(profileId)) {
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
