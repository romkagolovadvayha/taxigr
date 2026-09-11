import { useEffect, useState } from 'react';
import { useForegroundScreen } from './use-foreground-screen';

// Visual clocks stop while covered by another route or when the app is in the
// background. Refresh immediately on return instead of replaying missed ticks.
export function useScreenClock(intervalMs: number, enabled = true): number {
  const active = useForegroundScreen();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active || !enabled) return;
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [active, enabled, intervalMs]);
  return now;
}
