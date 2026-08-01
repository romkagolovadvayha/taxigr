import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { SessionProvider } from '@/auth/session-provider';
import { CriticalErrorMonitor } from '@/errors/critical-error-monitor';
import { RideFeedbackProvider } from '@/feedback/ride-feedback-provider';
import { FeedbackPreferencesProvider } from '@/preferences/feedback-preferences-provider';
import { NotificationRegistrar } from '@/providers/notification-registrar';
import { PassengerLocationPublisher } from '@/providers/passenger-location-publisher';
import { PassengerPreferencesProvider } from '@/preferences/passenger-preferences-provider';
import { RideProvider } from '@/state/ride-provider';

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected ?? true)),
);

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
      <SessionProvider>
        <CriticalErrorMonitor />
        <PassengerPreferencesProvider>
          <FeedbackPreferencesProvider>
            <NotificationRegistrar />
            <RideProvider>
              <RideFeedbackProvider>
                <PassengerLocationPublisher />
                {children}
              </RideFeedbackProvider>
            </RideProvider>
          </FeedbackPreferencesProvider>
        </PassengerPreferencesProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
