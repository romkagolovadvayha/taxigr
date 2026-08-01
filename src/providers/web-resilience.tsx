import { useEffect } from 'react';

export function WebResilience() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    const register = () => {
      void navigator.serviceWorker
        .register('/service-worker.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          // The regular online app remains available when service workers are blocked.
        });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
