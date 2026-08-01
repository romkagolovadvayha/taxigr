import type { StoredFeedbackPreferences } from '@/preferences/feedback-preferences-storage';

export const FEEDBACK_PREFERENCES_STORAGE_KEY = 'taxi_grahovo_feedback_preferences_v1';

const defaults: StoredFeedbackPreferences = {
  soundEnabled: true,
  vibrationEnabled: true,
};

export async function readStoredFeedbackPreferences(): Promise<StoredFeedbackPreferences> {
  try {
    const stored = globalThis.localStorage?.getItem(FEEDBACK_PREFERENCES_STORAGE_KEY);
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
    globalThis.localStorage?.setItem(
      FEEDBACK_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Private browsing may disable storage; the in-memory setting remains usable.
  }
}
