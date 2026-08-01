export type StoredFeedbackPreferences = {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
};

export const FEEDBACK_PREFERENCES_STORAGE_KEY = 'taxi_grahovo_feedback_preferences_v1';

export async function readStoredFeedbackPreferences(): Promise<StoredFeedbackPreferences> {
  return { soundEnabled: true, vibrationEnabled: true };
}

export async function writeStoredFeedbackPreferences(
  _preferences: StoredFeedbackPreferences,
): Promise<void> {}
