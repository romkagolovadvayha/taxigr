import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { SessionProvider, useSession } from '@/auth/session-provider';
import { VkCommunityPromptHost } from '@/components/auth/vk-community-prompt';
import { SearchPriceIncreaseModalHost } from '@/components/passenger/search-price-increase-card';
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

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected ?? true)),
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
        <SearchPriceIncreaseModalHost />
        {children}
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
        </SessionProvider>
      </AppUpdateProvider>
    </QueryClientProvider>
  );
}
