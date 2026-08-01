import {
  setAudioModeAsync,
  useAudioPlayer,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/auth/session-provider';
import {
  feedbackForRideChange,
  shouldPlayRideFeedbackSound,
  type RideFeedback,
  type RideFeedbackKind,
} from '@/feedback/ride-feedback';
import { useFeedbackPreferences } from '@/preferences/feedback-preferences-provider';
import { useRide } from '@/state/ride-provider';

type RideFeedbackContextValue = {
  previewFeedback: () => Promise<void>;
};

const RideFeedbackContext = createContext<RideFeedbackContextValue | null>(null);
const inactiveFeedback: RideFeedbackContextValue = {
  previewFeedback: async () => undefined,
};

const hapticTypes = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} as const;

const soundSources: Record<NonNullable<RideFeedback['sound']>, number> = {
  'taxi-found': require('../../assets/sounds/taxi_found.wav'),
  'driver-arrived': require('../../assets/sounds/driver_arrived.wav'),
  'new-order': require('../../assets/sounds/new_order.wav'),
  'ride-started': require('../../assets/sounds/ride_started.wav'),
  'ride-complete': require('../../assets/sounds/ride_complete.wav'),
  'ride-cancelled': require('../../assets/sounds/ride_cancelled.wav'),
};

function AudioRideFeedbackProvider({ children }: { children: ReactNode }) {
  const { currentRide } = useRide();
  const { user } = useSession();
  const {
    soundEnabled,
    vibrationEnabled,
  } = useFeedbackPreferences();
  const previousRide = useRef(currentRide);
  const player = useAudioPlayer(null);
  const playerRef = useRef(player);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {
      // Audio feedback remains optional if a platform cannot configure its session.
    });
  }, []);

  const performFeedback = useCallback(
    async (feedback: RideFeedback, allowWebSound = false) => {
      const actions: Promise<unknown>[] = [];
      const soundAllowedByPlatform = shouldPlayRideFeedbackSound(
        process.env.EXPO_OS === 'web',
        allowWebSound,
      );
      if (soundEnabled && feedback.sound && soundAllowedByPlatform) {
        actions.push(
          (async () => {
            const audioPlayer = playerRef.current;
            audioPlayer.pause();
            audioPlayer.replace(soundSources[feedback.sound!]);
            audioPlayer.volume = 0.82;
            audioPlayer.play();
          })(),
        );
      }
      if (vibrationEnabled) {
        actions.push(Haptics.notificationAsync(hapticTypes[feedback.haptic]));
      }
      await Promise.allSettled(actions);
    },
    [soundEnabled, vibrationEnabled],
  );

  useEffect(() => {
    const previous = previousRide.current;
    previousRide.current = currentRide;
    if (AppState.currentState !== 'active') return;

    const feedback = feedbackForRideChange(
      previous,
      currentRide,
      user?.id ?? null,
      user?.roles.includes('driver') ?? false,
    );
    if (feedback) void performFeedback(feedback);
  }, [currentRide, performFeedback, user]);

  const previewFeedback = useCallback(
    () =>
      performFeedback({
        kind: 'taxi-found' satisfies RideFeedbackKind,
        haptic: 'success',
        sound: 'taxi-found',
      }, true),
    [performFeedback],
  );

  const value = useMemo(() => ({ previewFeedback }), [previewFeedback]);

  return <RideFeedbackContext.Provider value={value}>{children}</RideFeedbackContext.Provider>;
}

export function RideFeedbackProvider({ children }: { children: ReactNode }) {
  const [audioReady, setAudioReady] = useState(process.env.EXPO_OS !== 'web');

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web') return;
    const timer = setTimeout(() => setAudioReady(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!audioReady) {
    return (
      <RideFeedbackContext.Provider value={inactiveFeedback}>
        {children}
      </RideFeedbackContext.Provider>
    );
  }

  return <AudioRideFeedbackProvider>{children}</AudioRideFeedbackProvider>;
}

export function useRideFeedback(): RideFeedbackContextValue {
  const value = React.use(RideFeedbackContext);
  if (!value) throw new Error('useRideFeedback must be used inside RideFeedbackProvider');
  return value;
}
