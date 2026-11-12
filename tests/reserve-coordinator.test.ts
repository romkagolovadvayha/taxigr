import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReserveCoordinator, type ReserveClient } from '../src/api/reserve-coordinator';
import { getApiChannel, setApiChannel, shouldTryPrimary } from '../src/api/api-channel';

const result = { id: 'test', status: 200, body: '{"data":{"id":"one-order"}}' };
const operation = { method: 'POST', path: '/v1/orders', token: 'passenger', body: '{}', requestId: 'same-transport-request-id' };
const candidate = (name: 'vk' | 'max', probe = vi.fn().mockResolvedValue(undefined), request = vi.fn().mockResolvedValue(result)): ReserveClient => ({ name, client: { probe, request } });
beforeEach(() => { vi.useFakeTimers(); setApiChannel('primary'); });
afterEach(() => { vi.useRealTimers(); });

describe('two reserve channels', () => {
  it('does not keep probing dead channels during their cooldown',async()=>{
    const vk=candidate('vk',vi.fn().mockRejectedValue(new Error('offline')));
    const max=candidate('max',vi.fn().mockRejectedValue(new Error('offline')));
    const coordinator=new ReserveCoordinator(()=>[vk,max]);
    await expect(coordinator.request(operation)).rejects.toBeInstanceOf(AggregateError);
    for (let i=0;i<20;i++) await expect(coordinator.request(operation)).rejects.toMatchObject({message:'RESERVE_COOLDOWN'});
    expect(vk.client.probe).toHaveBeenCalledOnce();expect(max.client.probe).toHaveBeenCalledOnce();
    expect(vk.client.request).not.toHaveBeenCalled();expect(max.client.request).not.toHaveBeenCalled();
  });
  it('does not send redundant health messages while the preferred channel keeps responding',async()=>{
    const vk=candidate('vk'),max=candidate('max');
    const coordinator=new ReserveCoordinator(()=>[vk,max]);
    for (let i=0;i<12;i++){await coordinator.request(operation);await vi.advanceTimersByTimeAsync(10_000);}
    expect(vk.client.probe).toHaveBeenCalledOnce();expect(max.client.probe).toHaveBeenCalledOnce();
  });
  it('probes in parallel and sends the operation only through the first healthy channel', async () => {
    const slow = vi.fn(() => new Promise<void>(() => undefined));
    const max = candidate('max', slow), vk = candidate('vk');
    const coordinator = new ReserveCoordinator(() => [max, vk]);
    expect(await coordinator.request(operation)).toEqual(result);
    expect(slow).toHaveBeenCalledOnce(); expect(vk.client.probe).toHaveBeenCalledOnce();
    expect(vk.client.request).toHaveBeenCalledOnce(); expect(max.client.request).not.toHaveBeenCalled();
    expect(getApiChannel()).toBe('vk');
  });
  it('reuses the exact operation ID, session and body through MAX after VK loses the answer', async () => {
    const vk = candidate('vk', undefined, vi.fn().mockRejectedValue(new Error('lost answer')));
    const max = candidate('max', vi.fn(() => new Promise<void>(() => undefined)));
    const coordinator = new ReserveCoordinator(() => [vk, max]);
    expect(await coordinator.request(operation)).toEqual(result);
    expect(vk.client.request).toHaveBeenCalledWith(operation, undefined, 8000);
    expect(max.client.request).toHaveBeenCalledWith(operation, undefined, 30_000);
    expect(getApiChannel()).toBe('max');
    await coordinator.request(operation);
    expect(vk.client.request).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 429, 500])('does not repeat a valid backend response (%s) through the other channel', async status => {
    const vk = candidate('vk', undefined, vi.fn().mockResolvedValue({ ...result, status }));
    const max = candidate('max', vi.fn(() => new Promise<void>(() => undefined)));
    const coordinator = new ReserveCoordinator(() => [vk, max]);
    expect((await coordinator.request(operation)).status).toBe(status);
    expect(max.client.request).not.toHaveBeenCalled();
  });
  it('bounds health probes even when the underlying transport is queued', async () => {
    const first = candidate('vk', vi.fn(() => new Promise<void>(() => undefined)));
    const second = candidate('max', vi.fn(() => new Promise<void>(() => undefined)));
    const coordinator = new ReserveCoordinator(() => [first, second]);
    const pending = expect(coordinator.request(operation)).rejects.toBeInstanceOf(AggregateError);
    await vi.advanceTimersByTimeAsync(8001); await pending;
    expect(first.client.request).not.toHaveBeenCalled(); expect(second.client.request).not.toHaveBeenCalled();
  });
  it('does not start an alternate operation after user cancellation', async () => {
    const abort = new AbortController();
    const vk = candidate('vk', undefined, vi.fn(async () => { abort.abort(); throw new Error('cancelled'); }));
    const max = candidate('max', vi.fn(() => new Promise<void>(() => undefined)));
    const coordinator = new ReserveCoordinator(() => [vk, max]);
    await expect(coordinator.request(operation, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(max.client.request).not.toHaveBeenCalled();
  });
  it('does not postpone primary recovery forever while reserve requests keep arriving', async () => {
    const vk = candidate('vk'); const coordinator = new ReserveCoordinator(() => [vk]);
    await coordinator.request(operation); expect(shouldTryPrimary()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000); await coordinator.request(operation);
    await vi.advanceTimersByTimeAsync(5001); expect(shouldTryPrimary()).toBe(true);
  });
  it('lets a queued cold-screen read finish without switching a healthy channel', async () => {
    const queued = vi.fn((_request, _signal, budget: number) => new Promise<typeof result>((resolve, reject) => {
      const answer = setTimeout(() => { clearTimeout(deadline); resolve(result); }, 12_000);
      const deadline = setTimeout(() => { clearTimeout(answer); reject(new Error('timeout')); }, budget);
    }));
    const vk = candidate('vk', undefined, queued), max = candidate('max', vi.fn(() => new Promise<void>(() => undefined)));
    const coordinator = new ReserveCoordinator(() => [vk, max]);
    const pending = coordinator.request({ method: 'GET', path: '/v1/admin/settings', token: 'admin' });
    await vi.advanceTimersByTimeAsync(12_001);
    expect(await pending).toEqual(result); expect(max.client.request).not.toHaveBeenCalled();
  });
});
