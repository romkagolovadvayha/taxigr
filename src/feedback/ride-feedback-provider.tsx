import * as Haptics from "expo-haptics";
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { AppState } from "react-native";

import { useSession } from "@/auth/session-provider";
import type { RideOrder } from "@/domain/models";
import {
  shouldPlayRideFeedbackSound,
  type RideFeedback,
} from "@/feedback/ride-feedback";
import { createRideFeedbackTracker } from "@/feedback/ride-feedback-tracker";
import { createVoicePlayer } from "@/feedback/voice-player";
import { createVoiceQueue } from "@/feedback/voice-queue";
import { useFeedbackPreferences } from "@/preferences/feedback-preferences-provider";
import { useRide } from "@/state/ride-provider";

type RideFeedbackContextValue = {
  previewFeedback: () => Promise<void>;
  announceMessage: (messageId: string) => void;
};
const RideFeedbackContext = createContext<RideFeedbackContextValue | null>(
  null,
);
const hapticTypes = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
} as const;
const soundSources: Record<NonNullable<RideFeedback["sound"]>, number> = {
  "taxi-found": require("../../assets/sounds/taxi_found.mp3"),
  "driver-arriving": require("../../assets/sounds/driver_arriving.mp3"),
  "driver-arrived": require("../../assets/sounds/driver_arrived.mp3"),
  "new-order": require("../../assets/sounds/new_order.mp3"),
  "ride-started": require("../../assets/sounds/ride_started.mp3"),
  "ride-complete": require("../../assets/sounds/ride_complete.mp3"),
  "ride-cancelled": require("../../assets/sounds/ride_cancelled.mp3"),
  "chat-message": require("../../assets/sounds/chat_message.mp3"),
  "order-updated": require("../../assets/sounds/order_updated.mp3"),
  "notification": require("../../assets/sounds/notification.mp3"),
  "voice-preview": require("../../assets/sounds/voice_preview.mp3"),
  "searching": require("../../assets/sounds/searching.mp3"),
  "driver-released": require("../../assets/sounds/driver_released.mp3"),
  "search-timeout": require("../../assets/sounds/search_timeout.mp3"),
  "passenger-cancelled": require("../../assets/sounds/passenger_cancelled.mp3"),
  "admin-cancelled": require("../../assets/sounds/admin_cancelled.mp3"),
  "taxi-found-queued": require("../../assets/sounds/taxi_found_queued.mp3"),
  "order-accepted": require("../../assets/sounds/order_accepted.mp3"),
  "order-accepted-queued": require("../../assets/sounds/order_accepted_queued.mp3"),
  "next-order-ready": require("../../assets/sounds/next_order_ready.mp3"),
  "driver-ready": require("../../assets/sounds/driver_ready.mp3"),
  "driver-departed": require("../../assets/sounds/driver_departed.mp3"),
  "driver-waiting": require("../../assets/sounds/driver_waiting.mp3"),
  "order-released": require("../../assets/sounds/order_released.mp3"),
  "ride-complete-cash": require("../../assets/sounds/ride_complete_cash.mp3"),
  "ride-complete-transfer": require("../../assets/sounds/ride_complete_transfer.mp3"),
  "driver-complete-cash": require("../../assets/sounds/driver_complete_cash.mp3"),
  "driver-complete-transfer": require("../../assets/sounds/driver_complete_transfer.mp3"),
  "driver-complete": require("../../assets/sounds/driver_complete.mp3"),
};

export function RideFeedbackProvider({ children }: { children: ReactNode }) {
  const { currentRide, driverRide, nextDriverRide, driverOffer, latestIncomingChatMessage, subscribeRideUpdates, bootstrapReady } =
    useRide();
  const { user } = useSession();
  const { soundEnabled, vibrationEnabled } = useFeedbackPreferences();
  const previousMessage = useRef(latestIncomingChatMessage?.id);
  const playerRef = useRef<ReturnType<typeof createVoiceQueue> | null>(null);
  const tracking = useRef({ userId: user?.id, ready: false, tracker: createRideFeedbackTracker() });
  const interacted = useRef(false);
  const announced = useRef(new Set<string>());
  const getPlayer = useCallback(
    () => (playerRef.current ??= createVoiceQueue(createVoicePlayer())),
    [],
  );

  useEffect(() => {
    if (
      process.env.EXPO_OS !== "web" ||
      !soundEnabled ||
      typeof document === "undefined"
    )
      return;
    const unlock = () => {
      interacted.current = true;
      void getPlayer().unlock();
    };
    if (navigator.userActivation?.hasBeenActive) unlock();
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
    };
  }, [getPlayer, soundEnabled]);

  useEffect(() => {
    if (!soundEnabled) playerRef.current?.stop();
  }, [soundEnabled]);
  useEffect(() => {
    playerRef.current?.stop();
    announced.current.clear();
  }, [user?.id]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") playerRef.current?.stop();
    });
    return () => {
      subscription.remove();
      playerRef.current?.release();
      playerRef.current = null;
    };
  }, []);

  const performFeedback = useCallback(
    async (feedback: RideFeedback, preview = false, group = 'preview') => {
      const actions: Promise<unknown>[] = [];
      if (
        soundEnabled &&
        feedback.sound &&
        shouldPlayRideFeedbackSound(
          process.env.EXPO_OS === "web",
          preview || interacted.current,
        )
      ) {
        const player = getPlayer();
        if (preview) { player.stop(); await player.unlock(); }
        actions.push(player.play(soundSources[feedback.sound], group));
      }
      if (vibrationEnabled)
        actions.push(Haptics.notificationAsync(hapticTypes[feedback.haptic]));
      await Promise.allSettled(actions);
    },
    [getPlayer, soundEnabled, vibrationEnabled],
  );

  const announce = useCallback(
    (key: string, feedback: RideFeedback, group = key) => {
      if (AppState.currentState !== "active" || announced.current.has(key))
        return;
      // A reconnect or the same event arriving through push and socket is announced once.
      if (announced.current.size >= 128)
        announced.current.delete(announced.current.values().next().value!);
      announced.current.add(key);
      void performFeedback(feedback, false, group);
    },
    [performFeedback],
  );

  const observeRide = useCallback((ride: RideOrder) => {
    const state = tracking.current;
    if (!user || !state.ready || state.userId !== user.id) return;
    const event = state.tracker.observe(ride, user.id, user.roles.includes('driver'));
    if (event) announce(event.key, event.feedback, event.group);
  }, [announce, user]);

  useEffect(() => {
    if (tracking.current.userId !== user?.id) {
      tracking.current = { userId: user?.id, ready: false, tracker: createRideFeedbackTracker() };
    }
    if (!bootstrapReady || !user) return;
    const snapshots = [currentRide, driverRide, nextDriverRide, driverOffer];
    if (!tracking.current.ready) {
      tracking.current.tracker.seed(snapshots);
      tracking.current.ready = true;
      return;
    }
    snapshots.forEach(ride => { if (ride) observeRide(ride); });
  }, [bootstrapReady, currentRide, driverRide, nextDriverRide, driverOffer, user, observeRide]);

  // Observe actions/socket transitions before batched state replaces a completed
  // order with the next one or removes a cancelled queued order.
  useEffect(() => subscribeRideUpdates(observeRide), [subscribeRideUpdates, observeRide]);

  const announceMessage = useCallback(
    (messageId: string) => {
      announce(`message:${messageId}`, {
        kind: "chat-message",
        sound: "chat-message",
        haptic: "success",
      });
    },
    [announce],
  );
  useEffect(() => {
    const id = latestIncomingChatMessage?.id;
    if (!id || previousMessage.current === id) return;
    previousMessage.current = id;
    if (latestIncomingChatMessage.sender.id !== user?.id) announceMessage(id);
  }, [latestIncomingChatMessage, announceMessage, user?.id]);

  const previewFeedback = useCallback(
    () =>
      performFeedback(
        {
          kind: "taxi-found",
          haptic: "success",
          sound: "voice-preview",
        },
        true,
      ),
    [performFeedback],
  );
  const value = useMemo(
    () => ({ previewFeedback, announceMessage }),
    [previewFeedback, announceMessage],
  );
  return (
    <RideFeedbackContext.Provider value={value}>
      {children}
    </RideFeedbackContext.Provider>
  );
}

export function useRideFeedback(): RideFeedbackContextValue {
  const value = React.use(RideFeedbackContext);
  if (!value)
    throw new Error("useRideFeedback must be used inside RideFeedbackProvider");
  return value;
}
