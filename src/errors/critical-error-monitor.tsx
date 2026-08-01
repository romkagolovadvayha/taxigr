import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useSession } from '@/auth/session-provider';
import { reportCriticalClientError } from '@/errors/critical-error-reporter';

type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;
type ErrorUtilsApi = {
  getGlobalHandler?: () => GlobalErrorHandler;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};

export function CriticalErrorMonitor() {
  const pathname = usePathname();
  const { token } = useSession();
  const context = useRef({ pathname, token });

  useEffect(() => {
    context.current = { pathname, token };
  }, [pathname, token]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleError = (event: ErrorEvent) => {
        void reportCriticalClientError(event.error ?? new Error(event.message), {
          source: 'global-error',
          route: context.current.pathname,
          token: context.current.token,
          fatal: true,
        });
      };
      const handleRejection = (event: PromiseRejectionEvent) => {
        void reportCriticalClientError(event.reason, {
          source: 'unhandled-rejection',
          route: context.current.pathname,
          token: context.current.token,
        });
      };
      window.addEventListener('error', handleError);
      window.addEventListener('unhandledrejection', handleRejection);
      return () => {
        window.removeEventListener('error', handleError);
        window.removeEventListener('unhandledrejection', handleRejection);
      };
    }

    const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsApi }).ErrorUtils;
    const previousHandler = errorUtils?.getGlobalHandler?.();
    if (!errorUtils?.setGlobalHandler) return;
    const handler: GlobalErrorHandler = (error, isFatal) => {
      void reportCriticalClientError(error, {
        source: 'global-error',
        route: context.current.pathname,
        token: context.current.token,
        fatal: isFatal,
      });
      previousHandler?.(error, isFatal);
    };
    errorUtils.setGlobalHandler(handler);
    return () => {
      if (previousHandler) errorUtils.setGlobalHandler?.(previousHandler);
    };
  }, []);

  return null;
}
