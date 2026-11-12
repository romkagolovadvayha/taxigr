import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { OfflineNotice } from '@/components/ui/offline-notice';

import { SessionProvider, useSession } from '@/auth/session-provider';
import { VkCommunityPromptHost } from '@/components/auth/vk-community-prompt';
import { PassengerRideDialogs } from '@/components/passenger/passenger-ride-dialogs';
import { CriticalErrorMonitor } from '@/errors/critical-error-monitor';
import { RideFeedbackProvider } from '@/feedback/ride-feedback-provider';
import { FeedbackPreferencesProvider } from '@/preferences/feedback-preferences-provider';
import { LocationPermissionRegistrar } from '@/providers/location-permission-registrar';
import { NotificationRegistrar } from '@/providers/notification-registrar';
import { PassengerLocationPublisher } from '@/providers/passenger-location-publisher';
import { PassengerPreferencesProvider } from '@/preferences/passenger-preferences-provider';
import { RideProvider, useRideBootstrapReady } from '@/state/ride-provider';
import { AppUpdateProvider } from '@/updates/app-update-provider';
import { BookingAvailabilityProvider } from '@/providers/booking-availability-provider';
import { MiniAppBoundary } from '@/mini-apps/mini-app-boundary';
import { setPhysicalConnectivity } from '@/offline/connectivity';

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected ?? true);
    setPhysicalConnectivity(state.isConnected !== false);
  }),
);

function PostBootstrapServices() {
  const bootstrapReady = useRideBootstrapReady();
  if (!bootstrapReady) return null;
  return <NotificationRegistrar />;
}

function SessionScopedRideProviders({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const sessionOwner = user?.id ?? 'signed-out';

  return (
    <RideProvider key={sessionOwner}>
      <RideFeedbackProvider>
        <PostBootstrapServices />
        <PassengerLocationPublisher />
        <PassengerRideDialogs><View style={{flex:1}}><OfflineNotice /><View style={{flex:1}}>{children}</View></View></PassengerRideDialogs>
      </RideFeedbackProvider>
    </RideProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) =>
              failureCount < 2 && !(error instanceof Error && error.message.includes('401')),
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppUpdateProvider>
        <SessionProvider>
          <MiniAppBoundary>
          <CriticalErrorMonitor />
          <LocationPermissionRegistrar />
          <VkCommunityPromptHost />
          <PassengerPreferencesProvider>
            <FeedbackPreferencesProvider>
              <BookingAvailabilityProvider>
                <SessionScopedRideProviders>{children}</SessionScopedRideProviders>
              </BookingAvailabilityProvider>
            </FeedbackPreferencesProvider>
          </PassengerPreferencesProvider>
          </MiniAppBoundary>
        </SessionProvider>
      </AppUpdateProvider>
    </QueryClientProvider>
  );
}
