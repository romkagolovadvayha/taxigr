import * as SecureStore from 'expo-secure-store';

import type { StoredFeedbackPreferences } from '@/preferences/feedback-preferences-storage';

export const FEEDBACK_PREFERENCES_STORAGE_KEY = 'taxi_grahovo_feedback_preferences_v1';

const defaults: StoredFeedbackPreferences = {
  soundEnabled: true,
  vibrationEnabled: true,
};

export async function readStoredFeedbackPreferences(): Promise<StoredFeedbackPreferences> {
  try {
    const stored = await SecureStore.getItemAsync(FEEDBACK_PREFERENCES_STORAGE_KEY);
    if (!stored) return defaults;
    const parsed = JSON.parse(stored) as Partial<StoredFeedbackPreferences>;
    return {
      soundEnabled: parsed.soundEnabled !== false,
      vibrationEnabled: parsed.vibrationEnabled !== false,
    };
  } catch {
    return defaults;
  }
}

export async function writeStoredFeedbackPreferences(
  preferences: StoredFeedbackPreferences,
): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      FEEDBACK_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // A preference write must never prevent the app from working.
  }
}
