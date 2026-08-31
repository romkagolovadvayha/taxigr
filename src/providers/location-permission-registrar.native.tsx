import { useEffect } from 'react';

import { ensureForegroundLocationPermission } from '@/location/foreground-location-permission';

export function LocationPermissionRegistrar() {
  useEffect(() => {
    void ensureForegroundLocationPermission().catch(() => undefined);
  }, []);

  return null;
}
