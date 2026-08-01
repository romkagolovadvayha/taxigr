import React, {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  readStoredFeedbackPreferences,
  writeStoredFeedbackPreferences,
} from '@/preferences/feedback-preferences-storage';

type FeedbackPreferencesContextValue = {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  setVibrationEnabled: (enabled: boolean) => void;
};

const FeedbackPreferencesContext = createContext<FeedbackPreferencesContextValue | null>(null);

export function FeedbackPreferencesProvider({ children }: { children: ReactNode }) {
  const [soundEnabled, setSoundState] = useState(true);
  const [vibrationEnabled, setVibrationState] = useState(true);

  useEffect(() => {
    let active = true;
    void readStoredFeedbackPreferences().then((stored) => {
      if (!active) return;
      setSoundState(stored.soundEnabled);
      setVibrationState(stored.vibrationEnabled);
    });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((sound: boolean, vibration: boolean) => {
    void writeStoredFeedbackPreferences({
      soundEnabled: sound,
      vibrationEnabled: vibration,
    });
  }, []);

  const setSoundEnabled = useCallback(
    (enabled: boolean) => {
      setSoundState(enabled);
      persist(enabled, vibrationEnabled);
    },
    [persist, vibrationEnabled],
  );

  const setVibrationEnabled = useCallback(
    (enabled: boolean) => {
      setVibrationState(enabled);
      persist(soundEnabled, enabled);
    },
    [persist, soundEnabled],
  );

  const value = useMemo(
    () => ({
      soundEnabled,
      vibrationEnabled,
      setSoundEnabled,
      setVibrationEnabled,
    }),
    [setSoundEnabled, setVibrationEnabled, soundEnabled, vibrationEnabled],
  );

  return (
    <FeedbackPreferencesContext.Provider value={value}>
      {children}
    </FeedbackPreferencesContext.Provider>
  );
}

export function useFeedbackPreferences(): FeedbackPreferencesContextValue {
  const value = React.use(FeedbackPreferencesContext);
  if (!value) {
    throw new Error('useFeedbackPreferences must be used inside FeedbackPreferencesProvider');
  }
  return value;
}
