import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { loadMiniAppBridge } from './bridge';
import { getMiniAppProvider } from './runtime';

export function MiniAppNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    const provider = getMiniAppProvider();
    if (!provider) return;
    let disposed = false;
    let detach: (() => void) | undefined;
    void loadMiniAppBridge(provider).then(bridge => {
      if (disposed || !bridge.BackButton) return;
      const back = () => { if (router.canGoBack()) router.back(); else router.replace(provider === 'max' ? '/max' : '/telegram'); };
      const button = bridge.BackButton;
      if (pathname === '/' || pathname === `/${provider}`) button.hide();
      else { button.show(); button.onClick(back); }
      detach = () => { button.offClick(back); button.hide(); };
    }).catch(() => undefined);
    return () => { disposed = true; detach?.(); };
  }, [pathname]);
  return null;
}
