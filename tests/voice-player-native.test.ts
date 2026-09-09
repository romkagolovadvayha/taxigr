import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoicePlayer } from '../src/feedback/voice-player';

const audio = vi.hoisted(() => ({
  handlers: [] as ((status: { didJustFinish: boolean }) => void)[],
  remove: vi.fn(), replace: vi.fn(), play: vi.fn(), pause: vi.fn(), release: vi.fn(), mode: vi.fn(async () => {}),
}));
vi.mock('expo-audio', () => ({
  setAudioModeAsync: audio.mode,
  createAudioPlayer: () => ({ ...audio, volume: 1, addListener: (_: string, handler: (status: { didJustFinish: boolean }) => void) => {
    audio.handlers.push(handler); return { remove: audio.remove };
  } }),
}));
beforeEach(() => { vi.clearAllMocks(); audio.handlers.length = 0; });
afterEach(() => vi.restoreAllMocks());

describe('native voice completion', () => {
  it('signals the queue only when the current recording has finished', async () => {
    const player = createVoicePlayer();
    const ended = vi.fn();
    await player.play(1, ended);
    audio.handlers[0]!({ didJustFinish: false }); expect(ended).not.toHaveBeenCalled();
    audio.handlers[0]!({ didJustFinish: true }); expect(ended).toHaveBeenCalledOnce();
    player.release();
  });
  it('ignores late completion after mute or replacement', async () => {
    const player = createVoicePlayer(); const oldEnded = vi.fn(); const nextEnded = vi.fn();
    await player.play(1, oldEnded); await player.play(2, nextEnded);
    audio.handlers[0]!({ didJustFinish: true }); expect(oldEnded).not.toHaveBeenCalled();
    player.stop(); audio.handlers[1]!({ didJustFinish: true }); expect(nextEnded).not.toHaveBeenCalled();
    expect(audio.remove).toHaveBeenCalledTimes(2);
    player.release();
  });
});
