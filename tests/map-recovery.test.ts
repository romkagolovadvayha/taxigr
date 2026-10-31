import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchMapRecovery } from '../src/components/map/map-recovery.web';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('map recovery after a transport failure', () => {
  it('retries once and removes its online listener', async () => {
    vi.useFakeTimers();
    const events = new EventTarget(), retry = vi.fn();
    watchMapRecovery(retry, events, () => true);
    await vi.advanceTimersByTimeAsync(1_500);
    events.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('does not send retries while offline and recovers when connectivity returns', async () => {
    vi.useFakeTimers();
    const events = new EventTarget(), retry = vi.fn();
    let online = false;
    watchMapRecovery(retry, events, () => online);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(retry).not.toHaveBeenCalled();
    online = true;
    events.dispatchEvent(new Event('online'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('cancels both automatic triggers when the map recovers or unmounts', async () => {
    vi.useFakeTimers();
    const events = new EventTarget(), retry = vi.fn();
    const stop = watchMapRecovery(retry, events, () => true);
    stop();
    events.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(retry).not.toHaveBeenCalled();
  });
});
