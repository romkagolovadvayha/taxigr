import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoicePlayer } from '../src/feedback/voice-player.web';

vi.mock('expo-asset', () => ({ Asset: { fromModule: (id: number) => ({ uri: `/${id}.wav` }) } }));

const nodes: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; buffer: unknown }[] = [];
const decode = vi.fn();
const close = vi.fn();
const fetchAudio = vi.fn();
class Context {
  state = 'suspended';
  destination = {};
  resume = async () => { this.state = 'running'; };
  close = close;
  decodeAudioData = decode;
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
  createBufferSource = () => {
    const node = { buffer: null, start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), onended: null };
    nodes.push(node);
    return node;
  };
}

beforeEach(() => {
  nodes.length = 0;
  decode.mockReset().mockResolvedValue({ duration: 3 });
  close.mockReset().mockResolvedValue(undefined);
  fetchAudio.mockReset().mockImplementation(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) }));
  vi.stubGlobal('window', { AudioContext: Context });
  vi.stubGlobal('fetch', fetchAudio);
});
afterEach(() => vi.unstubAllGlobals());

describe('spoken notification playback', () => {
  it('stays silent before browser audio has been unlocked', async () => {
    await createVoicePlayer().play(1);
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(nodes).toHaveLength(0);
  });

  it('reuses decoded speech and stops the previous phrase instead of overlapping', async () => {
    const player = createVoicePlayer();
    await player.unlock();
    await player.play(1);
    await player.play(1);
    expect(fetchAudio).toHaveBeenCalledTimes(1);
    expect(nodes[0]!.stop).toHaveBeenCalledOnce();
    expect(nodes[1]!.start).toHaveBeenCalledOnce();
    player.release();
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not start delayed speech after the user mutes or leaves the app', async () => {
    let finish!: (buffer: object) => void;
    decode.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const player = createVoicePlayer();
    await player.unlock();
    const pending = player.play(1);
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    player.stop();
    finish({ duration: 3 });
    await pending;
    expect(nodes).toHaveLength(0);
    player.release();
  });

  it('does not let an old download replace a newer status', async () => {
    let finish!: (buffer: object) => void;
    decode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const player = createVoicePlayer();
    await player.unlock();
    const old = player.play(1);
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    await player.play(2);
    finish({ duration: 1 });
    await old;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.buffer).toEqual({ duration: 3 });
    player.release();
  });

  it('contains asset failures without producing an unhandled rejection', async () => {
    fetchAudio.mockRejectedValue(new Error('offline'));
    const player = createVoicePlayer();
    await player.unlock();
    await expect(player.play(1)).resolves.toBeUndefined();
    expect(nodes).toHaveLength(0);
    player.release();
  });
});
