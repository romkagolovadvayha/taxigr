import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { apiRequest } from '@/api/client';
import { getInstalledApplication, openApplicationStore } from '@/updates/installation';
import { AppUpdateController } from '@/updates/update-controller';

const AppUpdateContext = createContext<AppUpdateController | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new AppUpdateController({
    getInstallation: getInstalledApplication,
    fetchManifest: () => apiRequest('/v1/app-releases', { timeoutMs: 5_000, cache: 'no-store' }),
    readSeen: async (key) => await SecureStore.getItemAsync(key) === '1',
    writeSeen: (key) => SecureStore.setItemAsync(key, '1'),
    clearSeen: (key) => SecureStore.deleteItemAsync(key),
    readCached: async (store) => {
      const value = await SecureStore.getItemAsync(`taxigr_release_${store.replace(/-/g, '_')}`);
      return value ? JSON.parse(value) as unknown : null;
    },
    writeCached: (store, manifest) => SecureStore.setItemAsync(`taxigr_release_${store.replace(/-/g, '_')}`, JSON.stringify(manifest)),
    openStore: openApplicationStore,
  }));

  useEffect(() => {
    void controller.check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void controller.check();
    });
    return () => subscription.remove();
  }, [controller]);

  return <AppUpdateContext.Provider value={controller}>{children}</AppUpdateContext.Provider>;
}

export function useAppUpdate() {
  const controller = useContext(AppUpdateContext);
  if (!controller) throw new Error('AppUpdateProvider is missing');
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...state, controller };
}
