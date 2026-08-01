import React, {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  readStoredLocationSharing,
  writeStoredLocationSharing,
} from '@/preferences/location-sharing-storage';

type PassengerPreferencesContextValue = {
  shareLocationWithDriver: boolean;
  setShareLocationWithDriver: (enabled: boolean) => void;
};

const PassengerPreferencesContext = createContext<PassengerPreferencesContextValue | null>(null);

export function PassengerPreferencesProvider({ children }: { children: ReactNode }) {
  const [shareLocationWithDriver, setShareLocationState] = useState(true);

  useEffect(() => {
    let active = true;
    void readStoredLocationSharing().then((stored) => {
      if (active) setShareLocationState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  const setShareLocationWithDriver = useCallback((enabled: boolean) => {
    setShareLocationState(enabled);
    void writeStoredLocationSharing(enabled);
  }, []);

  const value = useMemo(
    () => ({ shareLocationWithDriver, setShareLocationWithDriver }),
    [setShareLocationWithDriver, shareLocationWithDriver],
  );

  return (
    <PassengerPreferencesContext.Provider value={value}>
      {children}
    </PassengerPreferencesContext.Provider>
  );
}

export function usePassengerPreferences(): PassengerPreferencesContextValue {
  const value = React.use(PassengerPreferencesContext);
  if (!value) {
    throw new Error('usePassengerPreferences must be used inside PassengerPreferencesProvider');
  }
  return value;
}
