import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { apiRequest } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { useAppForeground, useForegroundScreen } from '@/hooks/use-foreground-screen';
import { AppButton } from '@/components/ui/app-button';
import { AppModal } from '@/components/ui/app-modal';
import { bookingUnavailableMessage, bookingUnavailableTitle, type BookingAvailability } from '@/domain/booking-availability';

export const bookingAvailabilityQueryKey = ['booking-availability'] as const;
const Context = createContext<{
  enabled: boolean | undefined;
  checking: boolean;
  checkBooking: () => Promise<boolean>;
  showBookingUnavailable: () => void;
  observeBooking: () => () => void;
} | null>(null);

export function BookingAvailabilityProvider({ children }: { children: ReactNode }) {
  const { token } = useSession();
  const foreground = useAppForeground();
  const demo = token?.startsWith('demo:') ?? false;
  const client = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const [observers, setObservers] = useState(0);
  const observeBooking = useCallback(() => {
    setObservers((count) => count + 1);
    return () => setObservers((count) => count - 1);
  }, []);
  const query = useQuery({
    queryKey: bookingAvailabilityQueryKey,
    queryFn: ({ signal }) => apiRequest<BookingAvailability>('/v1/booking-availability', { signal, cache: 'no-store' }),
    enabled: !demo && foreground && observers > 0,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const showBookingUnavailable = useCallback(() => {
    client.setQueryData(bookingAvailabilityQueryKey, { enabled: false });
    setVisible(true);
  }, [client]);
  const checkBooking = useCallback(async () => {
    if (demo) return true;
    if (inFlight.current) return false;
    inFlight.current = true;
    setChecking(true);
    setError(null);
    try {
      const settings = await apiRequest<BookingAvailability>('/v1/booking-availability', { cache: 'no-store' });
      client.setQueryData(bookingAvailabilityQueryKey, settings);
      if (!settings.enabled) setVisible(true);
      return settings.enabled;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось проверить доступность заказа');
      return false;
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, [client, demo]);

  return (
    <Context.Provider value={{ enabled: demo ? true : query.data?.enabled, checking, checkBooking, showBookingUnavailable, observeBooking }}>
      {children}
      <AppModal visible={visible} title={bookingUnavailableTitle} description={bookingUnavailableMessage} onClose={() => setVisible(false)}>
        <AppButton onPress={() => { setVisible(false); router.push(token ? '/driver-application' : '/sign-in'); }}>Стать водителем</AppButton>
        <AppButton variant="quiet" onPress={() => setVisible(false)}>Понятно</AppButton>
      </AppModal>
      <AppModal visible={!!error} title="Не удалось проверить доступность заказа" description={`${error ?? ''}. Проверьте соединение и попробуйте нажать «Заказать такси» ещё раз.`} onClose={() => setError(null)}>
        <AppButton onPress={() => setError(null)}>Понятно</AppButton>
      </AppModal>
    </Context.Provider>
  );
}

export function useBookingAvailability() {
  const value = useContext(Context);
  if (!value) throw new Error('BookingAvailabilityProvider is required');
  return value;
}

export function useBookingAvailabilityPolling() {
  const { observeBooking } = useBookingAvailability();
  const visible = useForegroundScreen();
  useEffect(() => {
    if (visible) return observeBooking();
  }, [observeBooking, visible]);
}
