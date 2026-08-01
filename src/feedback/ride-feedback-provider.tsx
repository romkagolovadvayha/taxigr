import {
  setAudioModeAsync,
  type AudioPlayer,
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

const hapticTypes = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} as const;

export function RideFeedbackProvider({ children }: { children: ReactNode }) {
  const { currentRide } = useRide();
  const { user } = useSession();
  const {
    soundEnabled,
    vibrationEnabled,
  } = useFeedbackPreferences();
  const previousRide = useRef(currentRide);
  const activePlayer = useRef<AudioPlayer | null>(null);
  const taxiFoundPlayer = useAudioPlayer(require('../../assets/sounds/taxi_found.wav'));
  const driverArrivedPlayer = useAudioPlayer(require('../../assets/sounds/driver_arrived.wav'));
  const newOrderPlayer = useAudioPlayer(require('../../assets/sounds/new_order.wav'));
  const rideStartedPlayer = useAudioPlayer(require('../../assets/sounds/ride_started.wav'));
  const rideCompletePlayer = useAudioPlayer(require('../../assets/sounds/ride_complete.wav'));
  const rideCancelledPlayer = useAudioPlayer(require('../../assets/sounds/ride_cancelled.wav'));

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

  const playerForSound = useCallback(
    (sound: NonNullable<RideFeedback['sound']>): AudioPlayer => {
      const players: Record<NonNullable<RideFeedback['sound']>, AudioPlayer> = {
        'taxi-found': taxiFoundPlayer,
        'driver-arrived': driverArrivedPlayer,
        'new-order': newOrderPlayer,
        'ride-started': rideStartedPlayer,
        'ride-complete': rideCompletePlayer,
        'ride-cancelled': rideCancelledPlayer,
      };
      return players[sound];
    },
    [
      driverArrivedPlayer,
      newOrderPlayer,
      rideCancelledPlayer,
      rideCompletePlayer,
      rideStartedPlayer,
      taxiFoundPlayer,
    ],
  );

  const performFeedback = useCallback(
    async (feedback: RideFeedback, allowWebSound = false) => {
      const actions: Promise<unknown>[] = [];
      const soundAllowedByPlatform = shouldPlayRideFeedbackSound(
        process.env.EXPO_OS === 'web',
        allowWebSound,
      );
      if (soundEnabled && feedback.sound && soundAllowedByPlatform) {
        const player = playerForSound(feedback.sound);
        actions.push(
          (async () => {
            if (activePlayer.current && activePlayer.current !== player) {
              activePlayer.current.pause();
            }
            player.pause();
            player.volume = 0.82;
            if (process.env.EXPO_OS === 'web') {
              const seek = player.seekTo(0);
              player.play();
              await seek;
            } else {
              await player.seekTo(0);
              player.play();
            }
            activePlayer.current = player;
          })(),
        );
      }
      if (vibrationEnabled) {
        actions.push(Haptics.notificationAsync(hapticTypes[feedback.haptic]));
      }
      await Promise.allSettled(actions);
    },
    [playerForSound, soundEnabled, vibrationEnabled],
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

export function useRideFeedback(): RideFeedbackContextValue {
  const value = React.use(RideFeedbackContext);
  if (!value) throw new Error('useRideFeedback must be used inside RideFeedbackProvider');
  return value;
}
