import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoiceQueue } from '../src/feedback/voice-queue';

function setup() {
  const endings: (() => void)[] = [];
  const player = { unlock: vi.fn(async () => {}), play: vi.fn(async (_source: number, ended?: () => void) => { endings.push(ended!); }), stop: vi.fn(), release: vi.fn() };
  return { player, endings, queue: createVoiceQueue(player) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('voice queue', () => {
  it('finishes one order before announcing the next order and chat', async () => {
    const { player, queue, endings } = setup();
    await queue.play(1, 'ride-1'); await queue.play(2, 'ride-2'); await queue.play(3, 'chat-message');
    expect(player.play).toHaveBeenCalledTimes(1);
    endings[0]!(); expect(player.play.mock.calls[1]?.[0]).toBe(2);
    endings[1]!(); expect(player.play.mock.calls[2]?.[0]).toBe(3);
    expect(player.stop).not.toHaveBeenCalled();
    queue.release();
  });
  it('replaces an obsolete status immediately without losing another order', async () => {
    const { player, queue, endings } = setup();
    await queue.play(1, 'ride-1'); await queue.play(2, 'ride-2'); await queue.play(3, 'ride-1');
    expect(player.stop).toHaveBeenCalledOnce();
    expect(player.play.mock.calls.map(call => call[0])).toEqual([1, 3]);
    endings[0]!(); expect(player.play).toHaveBeenCalledTimes(2);
    endings[1]!(); expect(player.play.mock.calls[2]?.[0]).toBe(2);
    queue.release();
  });
  it('keeps only the newest waiting status for each order', async () => {
    const { player, queue, endings } = setup();
    await queue.play(1, 'ride-1'); await queue.play(2, 'ride-2'); await queue.play(3, 'ride-2');
    endings[0]!(); expect(player.play.mock.calls.map(call => call[0])).toEqual([1, 3]);
    queue.release();
  });
  it('clears queued phrases on mute, backgrounding or logout', async () => {
    const { player, queue, endings } = setup();
    await queue.play(1, 'ride-1'); await queue.play(2, 'ride-2');
    queue.stop(); endings[0]!(); await vi.advanceTimersByTimeAsync(30_000);
    expect(player.play).toHaveBeenCalledTimes(1);
    queue.release(); await queue.play(3, 'ride-3'); expect(player.play).toHaveBeenCalledTimes(1);
  });
  it('recovers from a missing native completion event', async () => {
    const { player, queue } = setup();
    await queue.play(1, 'ride-1'); await queue.play(2, 'ride-2');
    await vi.advanceTimersByTimeAsync(25_000);
    expect(player.play.mock.calls.map(call => call[0])).toEqual([1, 2]);
    queue.release();
  });
});
